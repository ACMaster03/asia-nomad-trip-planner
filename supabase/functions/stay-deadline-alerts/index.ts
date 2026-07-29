// Stay-deadline alerts (M1 item 8, push added for M0-gate gap 4) —
// Supabase Edge Function (Deno).
//
// Invoked daily by pg_cron (see README.md next to this file). Scans every
// trip's state.stays for approaching deadlines and alerts the trip's members:
//   - cancelUntil (free-cancellation deadline): email T-7, T-3, T-1
//   - chargeDate (card charged): email T-1
//   - PUSH mirrors the email on T-7 and T-1 only (gap 4 decision) — a phone
//     buzz for the endpoints of the window, email for everything. Push is
//     gated on profiles.notify_deadline_push and is best-effort; email stays
//     unconditional because a cancel-by date is real money.
// Dedupe: public.alert_log (migration 08) — one row per (trip, stay, kind,
// recipient); an alert is sent at most once, ever. Push rows use
// sent_to = 'push:<user_id>' so the two channels dedupe independently.
//
// Auth: verify_jwt is disabled for cron invocation; instead the caller must
// send the shared secret header (x-cron-secret) set via `supabase secrets`.
// Email: Resend (https://resend.com) — free tier is plenty for two travellers.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendEmail } from '../_shared/resend.ts'
import { sendWebPush, type WebPushTarget } from '../_shared/webpush.ts'

type Stay = {
  id: string
  name: string
  segId?: string
  cancelUntil?: string
  chargeDate?: string
  include?: boolean
  status?: string
}
type TripRow = {
  id: string
  owner: string
  name: string
  state: { meta?: { tripName?: string }; stays?: Stay[] }
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!
const FROM = Deno.env.get('ALERTS_FROM') ?? 'Nomad Planner <onboarding@resend.dev>'

// kind → how many days before the date the alert fires
const CANCEL_OFFSETS: Record<string, number> = { 'cancel-7': 7, 'cancel-3': 3, 'cancel-1': 1 }
const CHARGE_OFFSETS: Record<string, number> = { 'charge-1': 1 }
// kinds that ALSO push (email covers all of them) — gap 4: buzz at the window's
// endpoints, not on every ping
const PUSH_KINDS = new Set(['cancel-7', 'cancel-1', 'charge-1'])

function daysUntil(iso: string, today: Date): number {
  const target = new Date(iso + 'T00:00:00Z')
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('forbidden', { status: 403 })
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const todayIso = new Date().toISOString().slice(0, 10)
  const today = new Date(todayIso + 'T00:00:00Z')

  const { data: trips, error } = await admin.from('trips').select('id, owner, name, state')
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  let sent = 0
  const results: string[] = []

  for (const trip of (trips ?? []) as TripRow[]) {
    const stays = trip.state?.stays ?? []
    const due: { stay: Stay; kind: string; date: string; label: string }[] = []

    for (const stay of stays) {
      if (stay.include === false) continue // out-of-plan stays don't alert
      if (stay.cancelUntil) {
        const d = daysUntil(stay.cancelUntil, today)
        for (const [kind, offset] of Object.entries(CANCEL_OFFSETS)) {
          if (d === offset) due.push({ stay, kind, date: stay.cancelUntil, label: `free cancellation ends in ${offset} day${offset > 1 ? 's' : ''}` })
        }
      }
      if (stay.chargeDate) {
        const d = daysUntil(stay.chargeDate, today)
        for (const [kind, offset] of Object.entries(CHARGE_OFFSETS)) {
          if (d === offset) due.push({ stay, kind, date: stay.chargeDate, label: `card will be charged tomorrow` })
        }
      }
    }
    if (due.length === 0) continue

    // Recipients: owner + all members (editor AND viewer — a viewer partner
    // still wants the warning). Emails come from auth.users via the admin API.
    const { data: members } = await admin.from('trip_members').select('user_id').eq('trip_id', trip.id)
    const userIds = [...new Set([trip.owner, ...(members ?? []).map((m: { user_id: string }) => m.user_id)])]
    const emails: string[] = []
    for (const uid of userIds) {
      const { data: u } = await admin.auth.admin.getUserById(uid)
      if (u?.user?.email) emails.push(u.user.email)
    }

    // Push targets per user (gap 4): only users who kept notify_deadline_push
    // on AND have registered a device. Missing on both counts is the norm —
    // push is an extra buzz on top of the guaranteed email.
    const { data: prefs } = await admin
      .from('profiles').select('id,notify_deadline_push').in('id', userIds)
    const pushUids = (prefs ?? []).filter((p) => p.notify_deadline_push).map((p) => p.id)
    const subsByUid = new Map<string, WebPushTarget[]>()
    if (pushUids.length) {
      const { data: userSubs } = await admin
        .from('user_push_subscriptions')
        .select('id,user_id,endpoint,p256dh,auth')
        .eq('transport', 'webpush')
        .in('user_id', pushUids)
      for (const s of userSubs ?? []) {
        const list = subsByUid.get(s.user_id) ?? []
        list.push({ id: s.id, endpoint: s.endpoint, p256dh: s.p256dh!, auth: s.auth!, table: 'user_push_subscriptions' })
        subsByUid.set(s.user_id, list)
      }
    }

    for (const item of due) {
      for (const email of emails) {
        // dedupe: insert first; a conflict means it was already sent
        const { error: logErr } = await admin.from('alert_log').insert({
          trip_id: trip.id, item_id: item.stay.id, kind: item.kind, sent_to: email,
        })
        if (logErr) continue // unique violation → already sent

        const tripName = trip.state?.meta?.tripName ?? trip.name
        const res = await sendEmail(RESEND_API_KEY, {
          from: FROM,
          to: email,
          subject: `⏰ ${item.stay.name}: ${item.label} (${item.date})`,
          text: [
            `Heads-up from your trip "${tripName}":`,
            ``,
            `Stay: ${item.stay.name}`,
            `Deadline: ${item.date} — ${item.label}.`,
            ``,
            `Open the planner to review or act on it.`,
          ].join('\n'),
        })
        if (res.ok) {
          sent++
          results.push(`${item.kind} ${item.stay.name} -> ${email}`)
        } else {
          // roll the dedupe row back so a transient Resend failure retries tomorrow
          await admin.from('alert_log').delete().match({ trip_id: trip.id, item_id: item.stay.id, kind: item.kind, sent_to: email })
          // Cron-secret protected → surface the provider's reason verbatim.
          results.push(`FAILED ${item.kind} ${item.stay.name} -> ${email}: ${res.error}`)
        }
      }

      // Push mirror — T-7 and T-1 kinds only (gap 4 decision).
      if (!PUSH_KINDS.has(item.kind)) continue
      for (const [uid, targets] of subsByUid) {
        // same dedupe discipline as email: claim the log row first
        const { error: logErr } = await admin.from('alert_log').insert({
          trip_id: trip.id, item_id: item.stay.id, kind: item.kind, sent_to: `push:${uid}`,
        })
        if (logErr) continue // unique violation → already pushed
        const tripName = trip.state?.meta?.tripName ?? trip.name
        const { sent: ok } = await sendWebPush(admin, targets, {
          title: `⏰ ${item.stay.name}`,
          body: `${item.label} (${item.date}) — ${tripName}`,
          url: '/itinerary',
        })
        if (ok > 0) {
          sent++
          results.push(`${item.kind} ${item.stay.name} -> push:${uid} (${ok} device${ok > 1 ? 's' : ''})`)
        } else {
          // every device failed (or none left after pruning) → let tomorrow retry
          await admin.from('alert_log').delete().match({ trip_id: trip.id, item_id: item.stay.id, kind: item.kind, sent_to: `push:${uid}` })
          results.push(`push skipped ${item.kind} ${item.stay.name} -> ${uid} (no delivery)`)
        }
      }
    }
  }

  return new Response(JSON.stringify({ date: todayIso, sent, results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
