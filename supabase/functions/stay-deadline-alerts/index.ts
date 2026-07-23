// Stay-deadline email alerts (M1 item 8) — Supabase Edge Function (Deno).
//
// Invoked daily by pg_cron (see README.md next to this file). Scans every
// trip's state.stays for approaching deadlines and emails the trip's members:
//   - cancelUntil (free-cancellation deadline): T-7, T-3, T-1 days before
//   - chargeDate (card charged): T-1 day before
// Dedupe: public.alert_log (migration 08) — one row per (trip, stay, kind,
// recipient); an alert is sent at most once, ever.
//
// Auth: verify_jwt is disabled for cron invocation; instead the caller must
// send the shared secret header (x-cron-secret) set via `supabase secrets`.
// Email: Resend (https://resend.com) — free tier is plenty for two travellers.

import { createClient } from 'npm:@supabase/supabase-js@2'

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
    const userIds = [trip.owner, ...(members ?? []).map((m: { user_id: string }) => m.user_id)]
    const emails: string[] = []
    for (const uid of [...new Set(userIds)]) {
      const { data: u } = await admin.auth.admin.getUserById(uid)
      if (u?.user?.email) emails.push(u.user.email)
    }

    for (const item of due) {
      for (const email of emails) {
        // dedupe: insert first; a conflict means it was already sent
        const { error: logErr } = await admin.from('alert_log').insert({
          trip_id: trip.id, item_id: item.stay.id, kind: item.kind, sent_to: email,
        })
        if (logErr) continue // unique violation → already sent

        const tripName = trip.state?.meta?.tripName ?? trip.name
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
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
          }),
        })
        if (res.ok) {
          sent++
          results.push(`${item.kind} ${item.stay.name} -> ${email}`)
        } else {
          // roll the dedupe row back so a transient Resend failure retries tomorrow
          await admin.from('alert_log').delete().match({ trip_id: trip.id, item_id: item.stay.id, kind: item.kind, sent_to: email })
          results.push(`FAILED ${item.kind} ${item.stay.name} -> ${email}: ${res.status}`)
        }
      }
    }
  }

  return new Response(JSON.stringify({ date: todayIso, sent, results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
