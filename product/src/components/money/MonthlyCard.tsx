'use client'
import { useMemo } from 'react'
import { monthlyBuckets, type CityCost } from '@/lib/trips/budget'
import { monthShort, fmtMoney } from '@/lib/trips/format'
import type { TripState } from '@/lib/trips/types'

// "To cover the plan" — the old Monthly tab in one card: what has to come in
// each month, rent and daily living spread across nights, flights in the
// month they happen. Unchanged maths; just the words around it are gone.

export function MonthlyCard({ state, cityIdx, fmt }: { state: TripState; cityIdx: Record<string, CityCost>; fmt: (n: number) => string }) {
  const v = useMemo(() => {
    const { M, order } = monthlyBuckets(state, cityIdx)
    let nights = 0, a = 0, l = 0
    order.forEach((k) => { nights += M[k].nights; a += M[k].accom; l += M[k].live })
    const perMonth = (nights ? (a + l) / nights : 0) * 365 / 12
    const max = order.reduce((m, k) => Math.max(m, M[k].accom + M[k].live + M[k].transport), 0)
    return { M, order, perMonth, max }
  }, [state, cityIdx])
  if (!v.order.length) return null
  const usd = state.meta.baseCurrency !== 'USD' && state.rates?.USD ? fmtMoney(v.perMonth / state.rates.USD, 'USD') : null
  return (
    <div className="lv-enter rounded-[var(--r)] bg-sf p-[18px] text-tx">
      <div className="text-[12px] font-semibold uppercase tracking-[.11em] text-tx2">To cover the plan</div>
      <div className="mt-0.5 text-[22px] font-semibold">
        ≈ {fmt(v.perMonth)} <span className="text-[15px] font-medium text-tx2">per month{state.meta.travelers === 2 ? ', between you' : ''}</span>
      </div>
      <div className="mt-1 text-[13px] text-tx2">
        {usd ? `≈ ${usd} · ` : ''}stays and everyday costs spread over the months you’re away; flights land in the month they happen.
      </div>
      <div className="mt-3 flex flex-col gap-[7px] text-[13px]">
        {v.order.map((k, i) => {
          const b = v.M[k]
          const mt = b.accom + b.live + b.transport
          return (
            <div key={k} className="flex items-center gap-2.5">
              <span className="w-11 flex-none text-tx2">{monthShort(k).slice(0, 3)}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-track">
                <span className="lv-grow block h-full rounded-full bg-ac" style={{ width: Math.round((v.max ? mt / v.max : 0) * 100) + '%', animationDelay: `${i * 0.05}s` }} />
              </span>
              <b className="w-[84px] flex-none text-right">{fmt(mt)}</b>
            </div>
          )
        })}
      </div>
    </div>
  )
}
