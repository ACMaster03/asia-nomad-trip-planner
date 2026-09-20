// A subscription's next charge, for the Edge runtime.
//
// This is a DELIBERATE COPY of the arithmetic in
// product/src/lib/trips/subscriptions.ts (nextCharge / shiftMonths). The app is
// Next.js on Vercel and this is Deno on Supabase: there is no package the two
// share, and the existing functions duplicate the shapes they read for the same
// reason (stay-deadline-alerts declares its own `Stay`). Keep the two in step —
// the app's node tests (subscriptions.test.ts) are where the rules are pinned:
//
//   - the schedule is DECLARED (anchor + everyMonths), never inferred;
//   - the day of the month is CLAMPED to short months, measured from the
//     anchor every time, so a 31st anchor gives 28 Feb and then 31 Mar;
//   - the series runs FORWARD from the anchor only;
//   - `cancelledOn` stops it: a charge on that very day never happens.

export type Subscription = {
  id: string
  label: string
  cur: string
  amount: number
  everyMonths: number
  anchor: string
  remind?: boolean
  leadDays?: number
  cancelledOn?: string | null
}

const pad = (n: number) => String(n).padStart(2, '0')
const parse = (iso: string) => ({ y: +iso.slice(0, 4), m: +iso.slice(5, 7), d: +iso.slice(8, 10) })
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const validIso = (iso?: string | null): iso is string => !!iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)

export function shiftMonths(anchor: string, k: number): string {
  const { y, m, d } = parse(anchor)
  const total = y * 12 + (m - 1) + k
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${pad(nm)}-${pad(Math.min(d, daysInMonth(ny, nm)))}`
}

export function nextCharge(sub: Subscription, fromIso: string): string | null {
  if (!validIso(sub.anchor) || !validIso(fromIso)) return null
  const every = Math.max(1, Math.round(Number(sub.everyMonths) || 1))
  const a = parse(sub.anchor)
  const f = parse(fromIso)
  let k = Math.max(0, Math.floor(((f.y - a.y) * 12 + (f.m - a.m)) / every))
  for (let i = 0; i < 4; i++, k++) {
    const at = shiftMonths(sub.anchor, k * every)
    if (at < fromIso) continue
    if (validIso(sub.cancelledOn) && at >= sub.cancelledOn) return null
    return at
  }
  return null
}
