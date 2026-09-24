'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Info } from 'lucide-react'
import { categoryLabel } from '@/lib/trips/categories'
import { oneOffs } from '@/lib/trips/extras'
import { shortDate } from '@/lib/trips/timeline'
import type { LedgerEntry, TripState } from '@/lib/trips/types'
import { FoldButton, FoldedRow } from './Fold'

// One-offs & extras (#39) — the fourth budget family, back on the Money page.
//
// ExtrasTab has been telling people "see {total} in Money" since the merge
// (ExtrasTab.tsx) while `grep extras product/src/components/money/` returned
// nothing. Visas, insurance and gear were inside the number the page compared
// your spending against, with no way to see what they were.
//
// TWO COLUMNS, NEVER ONE TOTAL. Planned is `state.extras` — a forecast. Paid is
// the ledger rows in the one-off categories — money that actually moved. Add
// them together and a planned visa fee plus its own ledger row counts twice.
// The gap between the columns is the interesting number and the card shows it
// by putting them side by side, not by subtracting them into a third figure.
//
// Rows pair by CATEGORY: that is the only join the data actually has. The
// extras form writes its own words ("Insurance", "Visa") and the ledger writes
// registry ids ("insurance"), so both sides go through extraCategoryId() —
// before that (2026-09-23) "Insurance" planned and "insurance" paid were two
// rows, which nobody saw only because nothing had been paid yet.
//
// Paid counts the ledger rows in the one-off categories PLUS every row that
// came from an extra (source.kind 'extra'), whatever its category: a vaccine
// files under health, and it must still pair with the Vaccines it was planned
// as. Since 2026-09-23 an extra with a paid-on date writes that row itself
// (importCosts.ts), so the two columns fill from one entry.
//
// Mock 16 §3 (2026-09-23): the total row is called Total; the paragraph about
// the two columns went behind ⓘ (#65). Only the paid total is bold, as the
// paid figure is on every row above (Petra, 23 Sep): what has actually moved
// is the card's anchor, the forecast beside it stays regular.
//
// Under each heading, one line per extra of that category, by name, with where
// it stands ("paid 12 Aug", "not paid yet" in amber), and one line for the
// payments typed on Money ("backpack · logged 20 Aug"). The heading wraps
// instead of truncating. Petra on the phone after #74: "the e-visas entry is
// not there": insurance and visas share a category, the phone cut the heading
// to "Insurance & …" and the single line under it named only the latest
// payment. The grouping lives in oneOffs() (lib/trips/extras.ts), tested there.
//
// On Money it starts folded to one line (Fold.tsx): the two totals side by
// side, never added, and how many extras are not paid yet, in amber.

export function OneOffsCard({ state, ledger, fmt, todayIso, folded, onToggle }: {
  state: TripState
  ledger: LedgerEntry[]
  fmt: (n: number) => string
  todayIso: string
  /** with onToggle: one line, or the card with ⌃ (Fold.tsx) */
  folded?: boolean
  onToggle?: () => void
}) {
  const v = useMemo(() => oneOffs(state, ledger, todayIso), [state, ledger, todayIso])
  const [info, setInfo] = useState(false)

  if (!v.groups.length && !v.excludedCount) {
    return (
      <div className="lv-enter rounded-[var(--r)] bg-sf px-[18px] py-4 text-tx">
        <div className="text-[12px] font-semibold uppercase tracking-[.12em] text-ac2-deep">One-offs &amp; extras</div>
        <p className="mt-1.5 text-base text-tx2">Visas, insurance, gear: the costs of the whole trip. Add them on the Trip page and they show here beside what you paid.</p>
      </div>
    )
  }
  if (folded && onToggle) {
    const unpaid = v.groups.reduce((a, g) => a + g.items.filter((it) => it.state === 'unpaid').length, 0)
    return (
      <FoldedRow
        title="One-offs & extras"
        onOpen={onToggle}
        summary={<>
          {fmt(v.plannedTotal)} planned · {fmt(v.paidTotal)} paid
          {unpaid > 0 && <> · <span className="whitespace-nowrap text-warn">{unpaid} not paid yet</span></>}
        </>}
      />
    )
  }
  return (
    <div className="lv-enter rounded-[var(--r)] bg-sf px-[18px] pb-2 pt-1.5 text-tx">
      <div className="flex items-center justify-between border-b border-ln py-2.5">
        <span className="text-[12px] font-semibold uppercase tracking-[.12em] text-ac2-deep">One-offs &amp; extras</span>
        <span className="flex items-center">
          <button type="button" aria-label="What the two columns mean" aria-expanded={info} onClick={() => setInfo((v) => !v)} className="-my-2 flex size-11 items-center justify-center text-tx3">
            <Info aria-hidden className="size-[18px]" />
          </button>
          {onToggle && <FoldButton label="One-offs and extras" onFold={onToggle} />}
        </span>
      </div>
      {info && (
        <p className="border-b border-ln py-2.5 text-[13px] text-tx2">
          Planned is a forecast, paid is an entry in All entries. The same cost can sit in both columns, so they are never added together. Paid also counts payments you never planned, like bank fees. Give an extra its paid-on date and the paid entry is written for you.
        </p>
      )}
      <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 pt-2 text-[12px] font-semibold uppercase tracking-[.09em] text-tx3">
        <span />
        <span className="w-[78px] text-right min-[380px]:w-[86px]">Planned</span>
        <span className="w-[78px] text-right min-[380px]:w-[86px]">Paid</span>
      </div>
      {v.groups.map((g) => (
        <div key={g.cat} className="border-t border-ln py-2.5">
          <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4">
            <span className="min-w-0 text-base font-semibold">{categoryLabel(g.cat)}</span>
            <span className="w-[78px] text-right text-base min-[380px]:w-[86px]">{g.planned > 0 ? fmt(g.planned) : <span className="text-tx3">—</span>}</span>
            <span className="w-[78px] text-right text-base font-semibold min-[380px]:w-[86px]">
              {g.paid > 0 ? fmt(g.paid) : <span className="font-normal text-tx3">—</span>}
            </span>
          </div>
          {(g.items.length > 0 || g.logged) && (
            <ul className="mt-1 space-y-0.5 text-[13px] leading-snug text-tx2">
              {g.items.map((it) => (
                <li key={it.id}>
                  {it.label}
                  {' · '}
                  {it.state === 'unpaid' ? (
                    <span className="text-warn">not paid yet</span>
                  ) : (
                    `${it.state === 'paid' ? 'paid' : 'scheduled'} ${it.date ? shortDate(it.date) : ''}`
                  )}
                  {it.off && ' · switched off'}
                </li>
              ))}
              {g.logged && (
                <li>
                  {g.logged.more > 0
                    ? `${g.logged.note || 'A payment'} and ${g.logged.more} more · last logged ${shortDate(g.logged.date)}`
                    : `${g.logged.note ? `${g.logged.note} · ` : ''}logged ${shortDate(g.logged.date)}`}
                </li>
              )}
            </ul>
          )}
        </div>
      ))}
      <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 border-t-[1.5px] border-ln3 py-2.5">
        <span className="text-base font-semibold">Total</span>
        <span className="w-[78px] text-right text-base min-[380px]:w-[86px]">{fmt(v.plannedTotal)}</span>
        <b className="w-[78px] text-right text-base min-[380px]:w-[86px]">{fmt(v.paidTotal)}</b>
      </div>
      {v.excludedCount > 0 && (
        <p className="border-t border-ln pt-2.5 text-[13px] text-tx2">
          {v.excludedCount === 1 ? 'One extra is' : `${v.excludedCount} extras are`} switched off,
          {' '}{fmt(v.excluded)} that no total here counts.
        </p>
      )}
      <Link href="/itinerary?tab=extras" className="flex items-center justify-between gap-3 border-t border-ln py-2.5">
        <span className="text-base font-semibold text-ac2-deep">Edit extras</span>
        <ChevronRight aria-hidden className="size-5 text-ac2" />
      </Link>
    </div>
  )
}
