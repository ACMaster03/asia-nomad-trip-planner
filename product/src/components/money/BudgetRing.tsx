import { compactNumber } from '@/lib/trips/moneyText'

// The budget as a ring (the phone's BudgetRing; Patrik, 27 Sep, the parts on
// it 4 Oct): each part an arc in row order, the full circle the budget. Past
// the budget the parts stop at full and the rest runs on as an amber lap
// outside, the centre saying by how much. With no budget the circle is the
// whole and the centre says what's spent. 96 px across, a 10 px stroke.

export interface Arc {
  value: number
  color: string
  /** the days after the plan: striped, an estimate of an estimate */
  hatched?: boolean
}

const R = 43
const C = 2 * Math.PI * R

export function BudgetRing({ arcs, budget, spent }: { arcs: Arc[]; budget: number | null; spent: number }) {
  const total = arcs.reduce((a, x) => a + x.value, 0)
  const whole = Math.max(budget ?? total, 1)
  const over = budget ? total - budget : 0
  const gap = arcs.length > 1 ? 0.006 : 0
  // Each arc starts where the ones before it end.
  const starts = arcs.map((_, i) => arcs.slice(0, i).reduce((a, x) => a + x.value, 0))
  const label = over > 0 ? `${compactNumber(over)} over budget` : budget ? `${Math.round((total / whole) * 100)}% of budget` : `${Math.round((spent / whole) * 100)}% spent`
  return (
    <div className="relative size-[96px] flex-none" role="img" aria-label={label}>
      <svg viewBox="0 0 96 96" className="size-full -rotate-90">
        <defs>
          <pattern id="lv-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--ln3)" opacity="0.35" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--ln3)" strokeWidth="1.6" />
          </pattern>
        </defs>
        <circle cx="48" cy="48" r={R} fill="none" stroke="var(--tr)" strokeWidth="10" />
        {arcs.map((a, i) => {
          const start = starts[i] / whole
          const end = Math.min(1, (starts[i] + a.value) / whole)
          const len = end - gap - start
          if (len <= 0) return null
          return (
            <circle
              key={i}
              cx="48" cy="48" r={R} fill="none"
              stroke={a.hatched ? 'url(#lv-hatch)' : a.color}
              strokeWidth="10"
              strokeDasharray={`${len * C} ${C}`}
              strokeDashoffset={-start * C}
            />
          )
        })}
        {over > 0 && budget && (
          <circle
            cx="48" cy="48" r={R + 11} fill="none" stroke="var(--warn)" strokeWidth="5" strokeLinecap="round"
            strokeDasharray={`${Math.min(1, over / budget) * 2 * Math.PI * (R + 11)} ${2 * Math.PI * (R + 11)}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center leading-none">
        {over > 0 ? (
          <>
            <span className="text-[17px] font-semibold text-warn">+{compactNumber(over)}</span>
            <span className="mt-0.5 text-[10.5px] text-tx2">over budget</span>
          </>
        ) : (
          <>
            <span className="text-[19px] font-semibold text-tx">{Math.round(((budget ? total : spent) / whole) * 100)}%</span>
            <span className="mt-0.5 text-[10.5px] text-tx2">{budget ? 'of budget' : 'spent'}</span>
          </>
        )}
      </div>
    </div>
  )
}
