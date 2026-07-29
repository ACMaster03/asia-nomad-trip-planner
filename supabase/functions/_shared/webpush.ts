// Shared Web Push sender — used by push-fanout (events) and
// stay-deadline-alerts (deadlines). One place for VAPID setup and for the
// prune-on-410 rule so both functions treat dead endpoints identically.
//
// Secrets (project-wide): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.

import webpush from 'npm:web-push@3'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:patrik@keepyourhabits.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

export interface WebPushTarget {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  /** which table the row lives in — pruning must hit the right one */
  table: 'push_subscriptions' | 'user_push_subscriptions'
}

export interface PushNote {
  title: string
  body: string
  /** in-app path the notification opens (sw.ts notificationclick) */
  url?: string
}

/**
 * Send one payload to many subscriptions; endpoints the push service reports
 * gone (404/410 — unsubscribed, browser reset, app uninstalled) are pruned.
 * Returns counts for the caller's cron-secret-protected status output.
 */
export async function sendWebPush(
  sb: SupabaseClient,
  targets: WebPushTarget[],
  note: PushNote,
): Promise<{ sent: number; dropped: number }> {
  const payload = JSON.stringify(note)
  let sent = 0
  let dropped = 0
  await Promise.all(targets.map(async (t) => {
    try {
      await webpush.sendNotification(
        { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
        payload,
      )
      sent++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) {
        await sb.from(t.table).delete().eq('id', t.id)
        dropped++
      }
      // other failures (429, 5xx from the push service) are silently skipped:
      // push is best-effort by design; email is the guaranteed channel where
      // money is involved.
    }
  }))
  return { sent, dropped }
}
