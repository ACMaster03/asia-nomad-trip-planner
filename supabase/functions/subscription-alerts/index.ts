// Subscription charge alerts (issue #37) — Supabase Edge Function (Deno).
//
// Invoked daily by pg_cron (migration 40). Reads every trip's
// state.subscriptions, derives each one's next charge from its DECLARED anchor
// + cadence, and warns the trip's members before the money leaves the account.
//
// Differences from stay-deadline-alerts, all of them deliberate:
//
//   - THE OFFSET IS PER SUBSCRIPTION. A stay's T-7 is useful because you can
//     still cancel; a subscription reminder is "this is leaving the account",
//     so it is one ping at the lead time the owner picked (1 / 3 / 7 days),
//     and only for the ones they switched on. Most you never want told about.
//   - THE DEDUPE KEY IS THE CHARGE DATE. public.alert_log (migration 08) is
//     unique on (trip, item, kind, recipient) FOREVER, which is exactly right
//     for a one-off deadline and exactly wrong for something recurring: with a
//     fixed kind, October's reminder would be swallowed as a duplicate of
//     September's. `sub:<YYYY-MM-DD>` makes every occurrence its own alert
//     while keeping "at most once, ever" per occurrence.
//   - THE TRIGGER IS A WINDOW, NOT A DAY: it fires on the first run where the
//     charge is `leadDays` away OR NEARER. A stay deadline can afford an
//     exact-day test because a missed run only loses one ping of several; here
//     there is a single ping per charge, so a Resend hiccup on the day would
//     lose it outright. Since the dedupe key is the occurrence, a range cannot
//     double-send — it only lets tomorrow pick up what today dropped. It also
//     means a subscription added three days before it charges, with a T-7
//     reminder, still warns instead of silently missing its moment.
//   - PUSH MIRRORS EVERY EMAIL here. There is only one ping per charge, so
//     there is no window to buzz the endpoints of.
//
// Push is gated on notify_prefs.deadline_push (migration 37; a missing row
// means the defaults, i.e. on) and on the per-trip mute, and is best-effort.
// Email is unconditional: a charge you forgot about is real money.
//
// Auth: verify_jwt is disabled for cron invocation; the caller must present the
// signed x-cron-ts / x-cron-sig pair (_shared/cronAuth.ts, migration 30).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendEmail } from '../_shared/resend.ts'
import { sendWebPush, type WebPushTarget } from '../_shared/webpush.ts'
import { hasCronSecret } from '../_shared/cronAuth.ts'
import { nextCharge, type Subscription } from '../_shared/subscriptionSchedule.ts'

type TripRow = {
  id: string
  owner: string
  name: string
  state: { meta?: { tripName?: string }; subscriptions?: Subscription[] }
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM = Deno.env.get('ALERTS_FROM') ?? 'Livhold <hello@livhold.com>'
const LEADS = new Set([1, 3, 7])

function daysUntil(iso: string, today: Date): number {
  return Math.round((new Date(iso + 'T00:00:00Z').getTime() - today.getTime()) / 86_400_000)
}
const money = (sub: Subscription) => `${Math.round(Number(sub.amount) || 0).toLocaleString('en-US')} ${sub.cur}`

Deno.serve(async (req) => {
  if (!(await hasCronSecret(req))) {
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
    const subs = trip.state?.subscriptions ?? []
    const due: { sub: Subscription; kind: string; date: string; away: number }[] = []

    for (const sub of subs) {
      if (!sub?.remind || sub.cancelledOn) continue
      const lead = Number(sub.leadDays ?? 3)
      if (!LEADS.has(lead)) continue
      // Derived here and now, from the anchor — never read off a stored date,
      // so editing the subscription moves the reminder with it.
      const date = nextCharge(sub, todayIso)
      if (!date) continue
      const away = daysUntil(date, today)
      // Past its date is history, not a warning; the lead is the far edge.
      if (away < 0 || away > lead) continue
      due.push({ sub, kind: `sub:${date}`, date, away })
    }
    if (due.length === 0) continue

    // Recipients: owner + all members (editor AND viewer — a viewer partner
    // still wants to know what is about to be taken). Emails via the admin API.
    const { data: members } = await admin.from('trip_members').select('user_id').eq('trip_id', trip.id)
    const userIds = [...new Set([trip.owner, ...(members ?? []).map((m: { user_id: string }) => m.user_id)])]
    const emails: string[] = []
    for (const uid of userIds) {
      const { data: u } = await admin.auth.admin.getUserById(uid)
      if (u?.user?.email) emails.push(u.user.email)
    }

    // Push targets: migration 37's matrix, where a MISSING row means the
    // defaults — so opt-out is the only thing worth looking up. A trip muted
    // under Account → Alerts buzzes for nothing; the email still goes.
    const { data: prefs } = await admin
      .from('notify_prefs').select('user_id,deadline_push').in('user_id', userIds)
    const optedOut = new Set((prefs ?? []).filter((p) => p.deadline_push === false).map((p) => p.user_id))
    const { data: mutes } = await admin
      .from('trip_notify').select('user_id').eq('trip_id', trip.id).eq('muted', true).in('user_id', userIds)
    const mutedUids = new Set((mutes ?? []).map((m: { user_id: string }) => m.user_id))
    const pushUids = userIds.filter((uid) => !optedOut.has(uid) && !mutedUids.has(uid))
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
      const tripName = trip.state?.meta?.tripName ?? trip.name
      const when = item.away === 0 ? 'today' : item.away === 1 ? 'tomorrow' : `in ${item.away} days`
      const headline = `${item.sub.label} charges ${when}`

      for (const email of emails) {
        // dedupe: insert first; a conflict means this occurrence was already sent
        const { error: logErr } = await admin.from('alert_log').insert({
          trip_id: trip.id, item_id: item.sub.id, kind: item.kind, sent_to: email,
        })
        if (logErr) continue // unique violation → already sent

        const res = await sendEmail(RESEND_API_KEY, {
          from: FROM,
          to: email,
          subject: `🔔 ${headline} (${money(item.sub)})`,
          text: [
            `Heads-up from your trip "${tripName}":`,
            ``,
            `${item.sub.label} — ${money(item.sub)} on ${item.date}.`,
            ``,
            `It is one of the recurring costs you are carrying from home. Open the`,
            `planner to change the amount, move the date, or mark it cancelled.`,
          ].join('\n'),
        })
        if (res.ok) {
          sent++
          results.push(`${item.kind} ${item.sub.label} -> ${email}`)
        } else {
          // Roll the dedupe row back: with a windowed trigger, tomorrow's run
          // genuinely retries this occurrence rather than skipping it.
          await admin.from('alert_log').delete().match({ trip_id: trip.id, item_id: item.sub.id, kind: item.kind, sent_to: email })
          // Cron-secret protected → surface the provider's reason verbatim.
          results.push(`FAILED ${item.kind} ${item.sub.label} -> ${email}: ${res.error}`)
        }
      }

      for (const [uid, targets] of subsByUid) {
        // same dedupe discipline as email: claim the log row first
        const { error: logErr } = await admin.from('alert_log').insert({
          trip_id: trip.id, item_id: item.sub.id, kind: item.kind, sent_to: `push:${uid}`,
        })
        if (logErr) continue // unique violation → already pushed
        const { sent: ok } = await sendWebPush(admin, targets, {
          title: `🔔 ${headline}`,
          body: `${money(item.sub)} on ${item.date} · ${tripName}`,
          url: '/money',
        })
        if (ok > 0) {
          sent++
          results.push(`${item.kind} ${item.sub.label} -> push:${uid} (${ok} device${ok > 1 ? 's' : ''})`)
        } else {
          // every device failed (or none left after pruning) → tomorrow retries
          await admin.from('alert_log').delete().match({ trip_id: trip.id, item_id: item.sub.id, kind: item.kind, sent_to: `push:${uid}` })
          results.push(`push skipped ${item.kind} ${item.sub.label} -> ${uid} (no delivery)`)
        }
      }
    }
  }

  return new Response(JSON.stringify({ date: todayIso, sent, results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
