'use client'
import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { MoneyModel } from '@/lib/trips/moneyModel'
import { beyondEverydayAt, type SpentPart } from '@/lib/trips/moneyRows'
import { approxMoney, shortMoney } from '@/lib/trips/moneyText'
import { burnRate, isEverydayRow, type StopPlan } from '@/lib/trips/spending'
import { shortDate } from '@/lib/trips/timeline'
import { BudgetRing, type Arc } from './BudgetRing'
import { CardLabel } from './CardLabel'

// Money's top card (the phone's TopCard, MoneyScreen.swift): this stop or the
// whole journey (Patrik, 27 Sep, #114); before departure the estimate alone
// (#149). Journey is the money-on-the-road mock's version B (4 Oct): where the
// journey lands, the headline beside the budget ring, and the parts that add
// up to it, each a row and an arc, no "+" or "=". Spent so far opens to where
// it was spent. Until the projection unlocks (a week of pace on a new
// journey), only what's spent and what's still to pay.

type View = 'here' | 'journey'
const KEY = 'lv-money-top'

interface Part {
  id: string
  title: string
  value: number
  color: string
  hatched?: boolean
  /** an estimate reads "≈"; money already spent or booked reads in full */
  approx?: boolean
}
const AC = 'var(--ac)', AC2 = 'var(--ac2)', LN3 = 'var(--ln3)', WARN_LINE = 'var(--warnLine)', TX3 = 'var(--tx3)'
const HATCH = 'repeating-linear-gradient(45deg, var(--ln3) 0 1.5px, color-mix(in srgb, var(--ln3) 35%, transparent) 1.5px 4px)'

/** What the stop's figure includes, under "The stop comes to" (the phone's PlanCard.includedWords). */
export function includedWords(label: StopPlan['stayLabel']): string {
  return label === 'booked' ? 'stay paid' : label === 'unpaid' ? 'stay booked' : label === 'draft' ? 'stay not booked' : label === 'estimate' ? 'stay at the city average' : 'no stay yet'
}

export function TopCard({ model, fmt, todayIso, projecting }: {
  model: MoneyModel
  fmt: (n: number) => string
  todayIso: string
  /** the projection has unlocked (lib/trips/unlocks.ts): a week of pace on a new journey */
  projecting: boolean
}) {
  // The tab you left it on, kept per device (the phone's AppStorage "money.topView").
  const [view, setView] = useState<View>(() => {
    try { const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY); return v === 'here' ? 'here' : 'journey' } catch { return 'journey' }
  })
  const [travelPick, setTravelPick] = useState<View | null>(null)
  const [spentOpen, setSpentOpen] = useState(false)
  const pick = (v: View) => {
    if (model.currentPlan) { setView(v); try { localStorage.setItem(KEY, v) } catch {} }
    else setTravelPick(v)
  }
  // A travel day has no stop, so it opens on Journey (#149); the switch still works.
  const shown: View = model.currentPlan ? view : travelPick ?? 'journey'
  const p = model.projection
  const capValue = model.cap

  const big = (text: string) => <div className="truncate text-[34px] font-semibold leading-none tracking-[-.01em] text-ac2">{text}</div>
  const legendRow = (title: ReactNode, value: string, o: { swatch?: string; hatched?: boolean; bold?: boolean; small?: boolean; tone?: string; chevron?: boolean | null } = {}) => (
    <div className={'flex items-center gap-2 ' + (o.small ? 'text-[12.5px]' : 'text-[14px]') + (o.bold ? ' font-semibold' : '')}>
      {o.swatch && <span aria-hidden className="size-[9px] flex-none rounded-[2.5px]" style={{ background: o.hatched ? HATCH : o.swatch }} />}
      <span className={'min-w-0 flex-1 truncate ' + (o.small ? 'text-tx3' : o.bold ? (o.tone ?? 'text-tx') : 'text-tx2')}>{title}</span>
      <span className={'flex-none tabular-nums ' + (o.small ? 'text-tx3' : o.tone ?? 'text-tx')}>{value}</span>
      {o.chevron !== undefined && o.chevron !== null && <ChevronDown aria-hidden className={'size-[12px] flex-none text-tx3 transition-transform ' + (o.chevron ? 'rotate-180' : '')} strokeWidth={2.6} />}
    </div>
  )
  const partRow = (part: Part) => legendRow(part.title, part.approx === false ? fmt(part.value) : approxMoney(part.value, fmt), { swatch: part.color, hatched: part.hatched })
  const ring = (parts: Part[], spent: number) => (
    <Link href="/settings" aria-label="Money settings" className="flex-none p-[13px]">
      <BudgetRing arcs={parts.map((x): Arc => ({ value: x.value, color: x.color, hatched: x.hatched }))} budget={capValue} spent={spent} />
    </Link>
  )
  const divider = <div className="border-t border-ln" />
  /** The budget, then what's left in it or how far over the estimate goes: a fact, amber when over, never red. */
  const budgetRows = (total: number, unplanned: boolean) => {
    if (!capValue) return null
    const left = capValue - total
    return (
      <>
        {divider}
        <Link href="/settings" aria-label="Money settings">{legendRow('Budget', fmt(capValue))}</Link>
        {left < 0
          ? legendRow('Over budget', approxMoney(-left, fmt), { swatch: 'var(--warn)', bold: true, tone: 'text-warn' })
          : unplanned && p.unplannedDays > 0 && model.planEnd
            ? <div className="flex flex-col gap-0.5">
                {legendRow(`Left for ${p.unplannedDays} unplanned days`, approxMoney(left, fmt), { bold: true })}
                {legendRow(`after ${shortDate(model.planEnd)}`, `${approxMoney(left / p.unplannedDays, fmt)} a day`, { small: true })}
              </div>
            : legendRow('Left in the budget', approxMoney(left, fmt), { bold: true })}
      </>
    )
  }
  const unbookedLine = model.unbookedLegs.length > 0 && (
    <p className="text-[13px] text-warn">
      {model.unbookedLegs.length === 1
        ? `${model.unbookedLegs[0].from} → ${model.unbookedLegs[0].to} isn’t booked yet, so it isn’t counted.`
        : `${model.unbookedLegs.length} legs aren’t booked yet, so they aren’t counted.`}
    </p>
  )

  // Before departure: the planned journey's estimate, its parts on the ring against the budget,
  // and what the budget leaves for the days nothing is planned for (Patrik, 3 Oct, #149).
  const estimate = () => {
    const nights = model.plan.reduce((a, x) => a + x.nights, 0)
    const parts: Part[] = [
      { id: 'paid', title: 'Paid', value: p.spent, color: AC, approx: false },
      { id: 'due', title: 'Still to pay', value: p.toPay, color: AC2, approx: false },
      { id: 'ahead', title: 'Day to day', value: p.ahead, color: LN3 },
      { id: 'stays', title: 'Stays not booked yet', value: p.staysEstimated, color: WARN_LINE },
      { id: 'subs', title: 'Subscriptions', value: p.subsAhead, color: TX3 },
    ].filter((x) => x.value > 0 || x.id === 'paid')
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <CardLabel>Estimated total</CardLabel>
            <div className="mt-[3px]">{big(approxMoney(p.projected, fmt))}</div>
            <p className="mt-[3px] text-[13px] text-tx2">
              {nights > 0 && model.planEnd ? `the ${nights} planned nights, to ${shortDate(model.planEnd)}` : 'Add stops on Trip and their nights are estimated here.'}
            </p>
          </div>
          {ring(parts, p.spent)}
        </div>
        <div className="flex flex-col gap-[7px]">
          {parts.map((x) => <div key={x.id}>{partRow(x)}</div>)}
          {budgetRows(p.projected, true)}
        </div>
        {unbookedLine}
        {model.plan.some((x) => x.rateSrc === 'catalogue' && x.rate > 0) && (
          <p className="text-[12px] text-tx3">Day to day uses city averages from June 2026. It’s an approximate projection: what you really spend depends on how you travel.</p>
        )}
      </div>
    )
  }

  const spentTitle = (s: SpentPart) => (s.kind === 'before' ? 'Before departure' : s.kind === 'between' ? 'Between stops' : s.isCurrent ? `${s.city} so far` : s.city)
  const spentRow = (part: Part) => {
    const parts = model.spentParts
    return (
      <div className="flex flex-col gap-1.5">
        <button type="button" disabled={!parts.length} onClick={() => setSpentOpen((v) => !v)} aria-expanded={spentOpen} className="block w-full text-left">
          {legendRow(part.title, fmt(part.value), { swatch: part.color, chevron: parts.length ? spentOpen : null })}
        </button>
        {spentOpen && (
          <div className="ml-[17px] rounded-[10px] bg-canvas px-2.5 py-0.5">
            {parts.map((s) => (
              <Link key={s.id} href={s.kind === 'before' ? '/money/entries?before=1' : s.from && s.to ? `/money/entries?from=${s.from}&to=${s.to}` : '/money/entries'} className="flex items-center gap-2 py-1.5 text-[13px]">
                <span className="min-w-0 flex-1 truncate text-tx2">{spentTitle(s)}</span>
                <span className="flex-none tabular-nums text-tx">{fmt(s.total)}</span>
                <ChevronRight aria-hidden className="size-[10px] flex-none text-tx3" strokeWidth={2.6} />
              </Link>
            ))}
          </div>
        )}
      </div>
    )
  }
  /** The everyday pace: at this stop after three days there, else since departure. */
  const paceLine = () => {
    const pace = model.pace
    const title = pace.perDay !== null
      ? pace.scope === 'stop' ? (model.current ? `Your pace in ${model.current.city}` : 'Your pace at this stop') : 'Your pace since departure'
      : 'Your pace'
    const day = model.tripDay
    const value = pace.perDay !== null ? `${fmt(pace.perDay)} a day` : day ? `measuring, ${Math.min(day, 3)} of 3 days` : 'measuring…'
    return (
      <div className="flex items-center gap-2 text-[13.5px]">
        <span className="min-w-0 flex-1 truncate text-tx2">{title}</span>
        <span className="flex-none font-semibold text-tx">{value}</span>
      </div>
    )
  }
  /** Over the budget: what a day would need to cost less, amber, never red (Patrik, 27 Sep). */
  const lessLine = () => {
    if (!capValue || p.projected <= capValue || p.daysAhead <= 0) return null
    const less = Math.ceil((p.projected - capValue) / p.daysAhead / 50) * 50
    return <p className="text-[13px] text-warn">About {fmt(less)} a day less gets you there.</p>
  }

  const journey = () => {
    let parts: Part[] = [{ id: 'due', title: 'Still to pay', value: p.toPay, color: AC2, approx: false }]
    if (projecting) {
      parts = parts.concat([
        { id: 'ahead', title: `Day to day, ${p.remainingNights} nights`, value: p.ahead, color: LN3 },
        { id: 'stays', title: 'Stays not booked yet', value: p.staysEstimated, color: WARN_LINE },
        { id: 'after', title: `After the plan, ${p.unplannedDays} days`, value: p.unplanned, color: LN3, hatched: true },
        { id: 'subs', title: 'Subscriptions', value: p.subsAhead, color: TX3 },
      ])
    }
    parts = parts.filter((x) => x.value > 0)
    const spentPart: Part = { id: 'spent', title: 'Spent so far', value: p.spent, color: AC, approx: false }
    const total = projecting ? p.projected : p.spent + p.toPay
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <CardLabel>{projecting ? 'Lands near' : 'Spent so far'}</CardLabel>
            <div className="mt-[3px]">{big(projecting ? approxMoney(p.projected, fmt) : shortMoney(p.spent, fmt))}</div>
          </div>
          {ring([spentPart, ...parts], p.spent)}
        </div>
        <div className="flex flex-col gap-[7px]">
          {spentRow(spentPart)}
          {parts.map((x) => <div key={x.id}>{partRow(x)}</div>)}
          {projecting ? budgetRows(total, false) : capValue ? <>{divider}<Link href="/settings" aria-label="Money settings">{legendRow('Budget', fmt(capValue))}</Link></> : null}
        </div>
        {projecting && lessLine()}
        {divider}
        {paceLine()}
      </div>
    )
  }

  const here = () => {
    const row = model.currentPlan
    if (!row) {
      return (
        <div className="flex flex-col gap-1.5">
          <CardLabel>Here</CardLabel>
          <div className="font-serif text-[19px] text-tx">Between stops today.</div>
          <p className="text-[13px] text-tx2">The stop view comes back when you arrive somewhere on the plan.</p>
        </div>
      )
    }
    const to = todayIso < row.seg.depart ? todayIso : row.seg.depart
    const local = burnRate(model.ledger, model.rates, row.seg.arrive, to)
    const warnStay = row.stayLabel === 'draft' || row.stayLabel === 'none'
    const beyond = beyondEverydayAt(model.state, model.ledger, model.rates, todayIso, row.seg, isEverydayRow)
    const tile = (label: string, value: string, detail: string, tone = 'text-tx2') => (
      <div className="min-w-0 flex-1">
        <CardLabel>{label}</CardLabel>
        <div className="mt-0.5 truncate text-[19px] font-semibold text-tx">{value}</div>
        <div className={'text-[12.5px] ' + tone}>{detail}</div>
      </div>
    )
    return (
      <div className="flex flex-col gap-3">
        <div>
          <CardLabel>{row.seg.city} · night {Math.max(1, row.nightsIn)} of {row.nights}</CardLabel>
          <div className="mt-[3px]">{big(shortMoney(row.spent, fmt))}</div>
          <p className="mt-[3px] text-[13px] text-tx2">everyday costs here so far</p>
        </div>
        <div className="flex items-start gap-3">
          {tile('Per day here', fmt(local.perDay), `over ${local.days} days`)}
          {tile('The stop comes to', approxMoney(row.projected, fmt), includedWords(row.stayLabel), warnStay ? 'text-warn' : 'text-tx2')}
        </div>
        <StopBar row={row} />
        {beyond > 0 && (
          <>
            {divider}
            <Link href={`/money/entries?filter=beyond&from=${row.seg.arrive}&to=${to}`} className="flex items-center gap-2 text-[13.5px] text-tx2">
              <span className="min-w-0 flex-1 truncate">+ {fmt(beyond)} beyond the everyday here</span>
              <ChevronRight aria-hidden className="size-[12px] flex-none text-tx3" strokeWidth={2.6} />
            </Link>
          </>
        )}
      </div>
    )
  }

  const city = model.currentPlan?.seg.city
  const hereTitle = city && city.length <= 12 ? city : 'This stop'
  return (
    <div className="lv-enter rounded-[var(--r)] bg-sf p-4 text-tx">
      {model.beforeDeparture ? estimate() : (
        <div className="flex flex-col gap-3">
          <div className="flex rounded-[14px] border-[1.5px] border-ln2 bg-inp p-[3px]" role="radiogroup" aria-label="Show">
            {(['here', 'journey'] as const).map((v) => (
              <button key={v} role="radio" aria-checked={shown === v} onClick={() => pick(v)} className={'flex-1 rounded-[11px] py-1.5 text-[13px] font-semibold ' + (shown === v ? 'bg-sf text-tx shadow-sm' : 'text-tx2')}>
                {v === 'here' ? hereTitle : 'Journey'}
              </button>
            ))}
          </div>
          {shown === 'here' ? here() : journey()}
        </div>
      )}
    </div>
  )
}

/** The stop's nights: today above the bar where it stands, arrival and departure under its ends (Patrik, 27 Sep: the bar had no words). */
function StopBar({ row }: { row: StopPlan }) {
  const nights = Math.max(1, row.nights)
  const done = Math.min(row.nightsIn, nights)
  // Over the middle of tonight's night, kept inside the card.
  const x = done > 0 ? ((done - 0.5) / nights) * 100 : 0
  return (
    <div className="flex flex-col gap-[5px]">
      <div className="relative h-[15px]">
        <span className="absolute text-[12px] font-semibold text-ac2" style={{ left: `clamp(0px, calc(${x}% - 18px), calc(100% - 36px))` }}>today</span>
      </div>
      {nights <= 31 ? (
        <div className="flex h-2.5 gap-[2px]">
          {Array.from({ length: nights }, (_, i) => (
            <span key={i} className={'h-full flex-1 rounded-[2.5px] ' + (i < done ? 'bg-ac' : 'bg-track')} style={i < done - 1 ? { opacity: 0.75 } : undefined} />
          ))}
        </div>
      ) : (
        <div className="h-2.5 overflow-hidden rounded-full bg-track"><span className="lv-grow block h-full rounded-full bg-ac" style={{ width: (done / nights) * 100 + '%' }} /></div>
      )}
      <div className="flex justify-between text-[12.5px] text-tx2">
        <span>in {shortDate(row.seg.arrive)}</span>
        <span>{row.remaining > 0 ? `${row.remaining} nights left · out ${shortDate(row.seg.depart)}` : `last night · out ${shortDate(row.seg.depart)}`}</span>
      </div>
    </div>
  )
}
