import type { SupabaseClient } from '@supabase/supabase-js'
import { VAPID_PUBLIC_KEY } from '@/lib/follow/push'

// Traveller push opt-in (M0-gate gap 4, migration 27). The follower flow
// (lib/follow/push.ts) subscribes a SHARE LINK via RPC because followers have
// no accounts; travellers are signed in, so their subscription is a plain
// RLS-owned row keyed to auth.uid(). Same VAPID keypair — one Web Push
// identity for the whole app.

function toUint8(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const b64 = (base64url + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export type UserPushState = 'unsupported' | 'ios-install' | 'denied' | 'subscribed' | 'ready'

// iOS WebKit only exposes the push API to Home-Screen-installed web apps
// (16.4+) — in a plain tab we must show install instructions, not silently
// hide. Same detection as the follower flow.
function isIOSBrowserNeedingInstall(): boolean {
  const iOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1)
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  return iOS && !standalone
}

export async function getUserPushState(): Promise<UserPushState> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    if (typeof window !== 'undefined' && isIOSBrowserNeedingInstall()) return 'ios-install'
    return 'unsupported'
  }
  if (Notification.permission === 'denied') return 'denied'
  // getRegistration, NOT .ready — .ready hangs forever on the SW-less dev server.
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return 'ready'
  const sub = await reg.pushManager.getSubscription()
  return sub ? 'subscribed' : 'ready'
}

export async function enableUserPush(sb: SupabaseClient): Promise<UserPushState> {
  // requestPermission MUST be the first thing in the tap handler: iOS only
  // shows the prompt during the tap's transient activation (see the follower
  // flow's dogfood note, 2026-07-24).
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'ready'
  const { data: auth } = await sb.auth.getUser()
  const uid = auth.user?.id
  if (!uid) throw new Error('Not signed in')
  let reg = await navigator.serviceWorker.getRegistration()
  if (!reg) {
    reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<undefined>((r) => setTimeout(() => r(undefined), 5000)),
    ])
  }
  if (!reg) return 'unsupported'
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: toUint8(VAPID_PUBLIC_KEY) as BufferSource,
  })
  const json = sub.toJSON()
  const { error } = await sb.from('user_push_subscriptions').upsert(
    {
      user_id: uid,
      transport: 'webpush',
      endpoint: sub.endpoint,
      p256dh: json.keys!.p256dh,
      auth: json.keys!.auth,
    },
    { onConflict: 'endpoint' },
  )
  if (error) {
    await sub.unsubscribe().catch(() => {})
    throw error
  }
  return 'subscribed'
}

export async function disableUserPush(sb: SupabaseClient): Promise<UserPushState> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await sb.from('user_push_subscriptions').delete().eq('endpoint', sub.endpoint)
      .then(() => {}, () => {})
    await sub.unsubscribe().catch(() => {})
  }
  return 'ready'
}

// ---------------------------------------------------------------------------
// Notification preferences (profiles.notify_*, migration 27 — applied to
// prod and staging 2026-07-29).
// ---------------------------------------------------------------------------
export type NotifyPrefs = { notifyDeadlinePush: boolean; notifyEventPush: boolean }

export async function fetchNotifyPrefs(sb: SupabaseClient): Promise<NotifyPrefs> {
  const { data: auth } = await sb.auth.getUser()
  const uid = auth.user?.id
  if (!uid) throw new Error('Not signed in')
  const { data, error } = await sb.from('profiles').select('notify_deadline_push,notify_event_push').eq('id', uid).maybeSingle()
  if (error) throw error
  const row = data as { notify_deadline_push?: boolean; notify_event_push?: boolean } | null
  return {
    notifyDeadlinePush: row?.notify_deadline_push ?? true,
    notifyEventPush: row?.notify_event_push ?? true,
  }
}

export async function updateNotifyPrefs(sb: SupabaseClient, prefs: Partial<NotifyPrefs>): Promise<void> {
  const { data: auth } = await sb.auth.getUser()
  const uid = auth.user?.id
  if (!uid) throw new Error('Not signed in')
  const patch: Record<string, boolean> = {}
  if (prefs.notifyDeadlinePush !== undefined) patch.notify_deadline_push = prefs.notifyDeadlinePush
  if (prefs.notifyEventPush !== undefined) patch.notify_event_push = prefs.notifyEventPush
  const { error } = await sb.from('profiles').update(patch).eq('id', uid)
  if (error) throw error
}
