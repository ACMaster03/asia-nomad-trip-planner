'use client'
import { useMemo } from 'react'
import { ChevronRight, TriangleAlert } from 'lucide-react'
import { useMoney } from '@/lib/trips/Money'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { computeBudget } from '@/lib/trips/budget'
import { toBase } from '@/lib/trips/format'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'

// Money · Budget (handoff frame 16). Structure: hero total card → category
// bars → by-stop list. All numbers stay computed from the real plan; only the
// presentation is LIVHOLD.

export function BudgetTab() {
  const { fmt, base } = useMoney()
  const { trip, cityIdx } = useTripScreen()
  const b = useMemo(
    () => (trip.data ? computeBudget(trip.data.state, cityIdx) : null),
    [trip.data, cityIdx],
  )
  if (trip.isPending) return <main className="mx-auto max-w-xl p-6">Loading…</main>
  if (!trip.data || !b) return <CreateTripEmptyState />

  const s = trip.data.state
  const cap = s.meta.budgetCap || 0
  const pct = cap ? Math.round((b.grand / cap) * 100) : null
  const left = Math.max(0, cap - b.grand)

  // Spent so far comes from the real ledger (same sum the ledger screen shows).
  let spent = 0
  trip.data.ledger.forEach((e) => {
    if (e.type === 'expense') spent += toBase(e.amount, e.currency, s.rates)
  })
  // "on track" mirrors the Home money card: spend pace vs plan pace, only
  // derivable once the trip has started and has a dated plan.
  const today = new Date()
  const day = s.meta.startDate ? Math.floor((+today - +new Date(s.meta.startDate)) / 86400000) + 1 : null
  const onTrack =
    day !== null && day >= 1 && b.totalNights > 0 && b.grand > 0
      ? spent <= (b.grand * Math.min(day, b.totalNights)) / b.totalNights
      : null

  // Grand total = entered numbers ONLY; gaps are named, never guessed
  // (owner decision 2026-07-24). `committed` is that figure; `grand` is the
  // blended ESTIMATE the hero leads with.
  const cats: [string, number, string][] = [
    ['Stays', b.accom, 'bg-ac'],
    ['Daily living', b.live, 'bg-cat-daily'],
    ['Transport', b.transport, 'bg-ac2'],
    ['One-off extras', b.extras, 'bg-warn'],
  ]
  const maxCat = Math.max(1, ...cats.map(([, v]) => v))
  const nMissing = b.missingAccomStops.length

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-3 px-[18px] pb-6 pt-[18px] text-tx">
      <div>
        <h1 className="font-serif text-[25px] font-semibold leading-[1.15] tracking-[-.01em]">Budget</h1>
        <p className="mt-1 text-base leading-normal text-tx2">
          {`Everything the plan will cost, in ${base} at your trip’s FX rates.`}
        </p>
      </div>

      {/* hero — estimated total */}
      <div className="lv-enter rounded-[var(--r)] bg-sf p-5">
        <div className="text-base font-medium uppercase tracking-[.11em] text-tx2">Estimated total</div>
        <div className="mt-1 text-[32px] font-semibold leading-[1.1] tracking-[-.02em]">{fmt(b.grand)}</div>
        {cap > 0 && (
          <p className="mt-1.5 text-base text-tx2">
            of {fmt(cap)} cap · <span className="font-semibold text-ac2-deep">{fmt(left)} left</span> · {pct}% of cap
          </p>
        )}
        <div className="mt-3.5 border-t border-ln pt-3.5">
          <div className="flex justify-between gap-3 text-base">
            <span className="text-tx2">Spent so far</span>
            <span className="font-semibold">
              {fmt(spent)}
              {onTrack === true && <span className="font-semibold text-ac2-deep"> · on track</span>}
            </span>
          </div>
          <div className="mt-2 flex justify-between gap-3 text-base">
            <span className="text-tx2">Committed by bookings</span>
            <span className="font-semibold">{fmt(b.committed)}</span>
          </div>
          <div className="mt-2 flex justify-between gap-3 text-base">
            <span className="text-tx2">Estimated per day</span>
            <span className="font-semibold">{fmt(b.perDay)}</span>
          </div>
        </div>
        {nMissing > 0 && (
          <div className="mt-3.5 flex gap-2 rounded-[calc(var(--r)-2px)] bg-warn-soft p-3">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 flex-none text-warn" strokeWidth={2} />
            <p className="text-base leading-snug text-warn">
              {nMissing} {nMissing === 1 ? 'stop has' : 'stops have'} no stay yet - those parts are city averages, not
              your numbers.
            </p>
          </div>
        )}
      </div>

      {/* where the money goes — the signature bars */}
      <div className="lv-enter rounded-[var(--r)] bg-sf p-5">
        <div className="flex flex-col gap-3">
          {cats.map(([label, val, color], i) => (
            <div key={label} className="flex items-center gap-3">
              <span className="w-[70px] flex-none text-base leading-tight text-tx2">{label}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-track">
                <div
                  className={'lv-grow h-full rounded-full ' + color}
                  style={{ width: Math.round((val / maxCat) * 100) + '%', animationDelay: `${i * 0.06}s` }}
                />
              </div>
              <span className="flex-none text-right text-base font-medium">{fmt(val)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* by stop */}
      <div className="text-base font-semibold uppercase tracking-[.12em] text-ac2-deep">By stop</div>
      <div className="rounded-[var(--r)] bg-sf px-4 text-tx">
        {b.perSeg.map((p) => (
          <div key={p.seg.id} className="flex items-center justify-between gap-3 border-b border-ln py-[13px]">
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold">{p.seg.city}</span>
              <span className="block text-base text-tx2">
                {p.nights} nights
                {p.accomSrc !== 'included' && <span className="text-warn"> · no stay yet</span>}
              </span>
            </span>
            <span className="flex flex-none items-center gap-1.5">
              <span className="text-base font-semibold">{fmt(p.total)}</span>
              <ChevronRight aria-hidden className="size-5 text-ac2" />
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 py-[13px]">
          <span className="text-base font-semibold">Stops subtotal</span>
          <span className="text-base font-semibold">{fmt(b.accom + b.live)}</span>
        </div>
      </div>
    </main>
  )
}
