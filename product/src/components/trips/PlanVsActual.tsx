import { segNights, nightsBetween } from '@/lib/trips/format'
import { isBookedStatus } from '@/lib/trips/commitment'
import type { Segment, Stay } from '@/lib/trips/types'

// The route as a row of bars, one per stop, widths proportional to nights.
// Lifted out of /live so it survives that screen: it is the one thing /live
// showed that Home never did, and the only place the plan and what actually
// happened are put side by side.
//
// The off-plan test is the LATEST arrived event against the planned current
// stop. It is not the same question as Home's drift banner, which compares the
// latest CHECK-IN place name and only within 48 hours. Both are kept: a stale
// arrival is a routing fact, a recent check-in somewhere else is a today fact.

// A stay that is actually committed — the same test the Money page uses, so
// "booked" means one thing across the app (lib/trips/commitment.ts).
const bookedStay = (stays: Stay[], segId: string) =>
  stays.find((st) => st.segId === segId && st.include !== false && isBookedStatus(st.status))

const pill = 'rounded-full border-[1.4px] px-2.5 py-0.5 text-base font-semibold'

export function PlanVsActual({
  inPlan,
  current,
  stays,
  todayStr,
  lastArrivedCity,
  className = '',
}: {
  inPlan: Segment[]
  current: Segment | null
  stays: Stay[]
  todayStr: string
  /** city of the most recent `arrived` event, if there is one */
  lastArrivedCity?: string
  className?: string
}) {
  if (inPlan.length === 0) return null
  const offPlan =
    !!current && !!lastArrivedCity && lastArrivedCity.toLowerCase() !== current.city.toLowerCase()

  return (
    <div className={'rounded-[var(--r)] bg-sf p-4 text-tx ' + className}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-base font-semibold uppercase tracking-[.11em] text-tx2">
          Plan vs actual
        </span>
        {offPlan ? (
          <span className={pill + ' border-warn-line text-warn'}>
            off plan · last arrived {lastArrivedCity}
          </span>
        ) : (
          <span className={pill + ' border-ac-line text-ac'}>on plan</span>
        )}
      </div>
      <div className="mt-2.5 flex gap-1">
        {inPlan.map((seg) => {
          const n = Math.max(segNights(seg), 1)
          const done = seg.depart <= todayStr
          const cur = seg === current
          const booked = !!bookedStay(stays, seg.id)
          const pct = cur
            ? Math.min(100, Math.round((nightsBetween(seg.arrive, todayStr) / n) * 100))
            : 0
          return (
            <div key={seg.id} className="min-w-0" style={{ flexGrow: n, flexBasis: 0 }}>
              <div className="mb-1 truncate text-center text-[13px] uppercase tracking-wide text-tx3">
                {seg.city.slice(0, 3)}
              </div>
              {done ? (
                <div className="h-2 rounded-full bg-ac" />
              ) : cur ? (
                <div className="relative h-2 rounded-full border border-ac-line bg-track">
                  <span
                    className="absolute inset-y-0 left-0 rounded-l-full bg-ac"
                    style={{ width: pct + '%' }}
                  />
                  <span
                    className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sf bg-ac"
                    style={{ left: pct + '%' }}
                  />
                </div>
              ) : (
                <div
                  className={
                    'h-2 rounded-full border bg-track ' +
                    (booked ? 'border-ln3' : 'border-dashed border-ln2')
                  }
                />
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-2 text-[13px] text-tx3">
        ● you are here · solid = booked · dashed = planned, unbooked · widths ∝ stop length
      </div>
    </div>
  )
}
