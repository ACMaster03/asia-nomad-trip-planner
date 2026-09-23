'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Bus, Plane, Settings, Ship, TrainFront } from 'lucide-react'
import NewCountryBanner from './NewCountryBanner'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { useTripRole } from '@/lib/trips/useTripRole'
import { useMoney } from '@/lib/trips/Money'
import { useConfirm } from '@/components/Confirm'
import { localISODate, nightsBetween, segNights, stayTotal, toBase } from '@/lib/trips/format'
import { isBookedStatus } from '@/lib/trips/commitment'
import { stopProgress, tripDay } from '@/lib/trips/progress'
import { stopsAround } from '@/lib/trips/whereAmI'
import {
  buildTimeline, legMoneyState, shiftDepartures, stayCounts, stayMoneyState, stopCoverage,
  type Leg, type NightRange, type Timeline as TimelineModel, type Tone,
} from '@/lib/trips/timeline'
import type { Segment, Stay, TransportLeg, TripState } from '@/lib/trips/types'
import { SaveError } from './SaveError'
import { ViewerNotice } from './ViewerNotice'
import CreateTripEmptyState from './CreateTripEmptyState'
import { StopSheet } from './StopSheet'
import { StaySheet } from './StaySheet'
import { LegSheet } from './LegSheet'
import { fmtDay, fmtHours, kicker } from './sheetKit'

// Trip as ONE timeline (mock 15 §1, #58): home, leg, stop, leg, stop … home,
// in date order, no tabs. The rail on the left is the journey.
//
// - Home is the first and the last node, hollow, with nothing to edit here.
// - A leg is the strip between two stops and the only place transport is
//   entered. Legs are pale mauve, the app's transport colour, and stops are
//   white cards, so a full list still reads at a glance (round 1). A booked
//   leg is solid and shows its price and paid state; an unbooked one is
//   dashed, and the rail goes dashed there too.
// - A stop card is the Stops card as it was, plus its stays underneath: one
//   row per stay with its nights, its money state and its total. The comfort
//   level is gone from the card and lives in the editor. The tick stays on
//   the card (round 1): the fastest, reversible way to take a stop out of the
//   budget, and a faded card shows a maybe-stop at a glance.
// - "No bed 30 Nov → 13 Dec" is the amber row inside a stop, a warning, and
//   tapping it opens Add stay with those dates already in.
// - The way home is a dashed "not planned yet" leg into the home node.
// - Copy diet (#65): nothing on this screen explains itself.
//
// Sections 1, 4, 5 and 6 of the mock are this build; the globe-and-sheet
// shell (§2) waits on the phone test recorded in docs/NOTES.md.

type SheetState =
  | { kind: 'stop'; seg: Segment | null; prefill?: { city: string; arrive?: string } }
  | { kind: 'stay'; seg: Segment; stay: Stay | null; range: NightRange | null }
  | { kind: 'leg'; leg: Leg | null; entry: TransportLeg | null }
  | null

type Row =
  | { t: 'home'; pos: 'start' | 'end' }
  | { t: 'leg'; leg: Leg }
  | { t: 'stop'; seg: Segment; maybe: boolean }
  | { t: 'add' }

// The rail, top to bottom. Unticked stops sit where their dates put them,
// faded, with no leg of their own; "+ Add stop" is always there, above the
// way home.
function railRows(tl: TimelineModel, maybes: Segment[]): Row[] {
  const out: Row[] = [{ t: 'home', pos: 'start' }]
  const stopRow = (seg: Segment): Row => ({ t: 'stop', seg, maybe: false })
  if (tl.legs.length) {
    if (tl.legs[0].from.kind === 'stop') out.push(stopRow(tl.legs[0].from.seg!))
    for (const leg of tl.legs) {
      if (leg.to.kind === 'home') out.push({ t: 'add' })
      out.push({ t: 'leg', leg })
      if (leg.to.kind === 'stop') out.push(stopRow(leg.to.seg!))
    }
    if (tl.legs[tl.legs.length - 1].to.kind !== 'home') out.push({ t: 'add' })
  } else {
    for (const seg of tl.stops) out.push(stopRow(seg))
    out.push({ t: 'add' })
  }
  if (tl.stops.length) out.push({ t: 'home', pos: 'end' })
  for (const m of maybes) {
    let idx = out.findIndex((r) => r.t === 'stop' && !r.maybe && r.seg.arrive > m.arrive)
    if (idx < 0) idx = out.findIndex((r) => r.t === 'add')
    out.splice(idx < 0 ? out.length : idx, 0, { t: 'stop', seg: m, maybe: true })
  }
  return out
}

const TONE: Record<Tone, string> = { ok: 'text-ac', warn: 'text-warn', muted: 'text-tx3' }
const NODE = {
  home: 'border-2 border-ac bg-canvas',
  stop: 'bg-ac',
  current: 'bg-ac ring-4 ring-ac-soft',
  maybe: 'bg-ln3',
  add: 'border-[1.5px] border-dashed border-ac2-line bg-canvas',
} as const
const tickBtn = '-m-2.5 flex size-11 flex-none items-center justify-center'
const tick = (on: boolean) =>
  'flex h-6 w-6 items-center justify-center rounded-lg text-base font-semibold transition-colors duration-[180ms] ' +
  (on ? 'border border-ac bg-ac text-on' : 'border-[1.5px] border-ln3 text-transparent')
const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t)

function Rail({ line, node, clipTop, clipBottom, nodeTop = 20 }: {
  line: 'solid' | 'dashed' | 'booked'
  node?: keyof typeof NODE
  clipTop?: boolean
  clipBottom?: boolean
  nodeTop?: number
}) {
  const lineCls = line === 'dashed' ? 'w-0 border-l-2 border-dashed border-ac2-line' : line === 'booked' ? 'w-0.5 bg-ac2-line' : 'w-0.5 bg-ln3'
  return (
    <div aria-hidden className="relative w-6 flex-none self-stretch">
      <span className={'absolute left-[11px] ' + lineCls} style={{ top: clipTop ? nodeTop : 0, bottom: clipBottom ? `calc(100% - ${nodeTop}px)` : 0 }} />
      {node && <span className={'absolute left-[6px] size-3 rounded-full ' + NODE[node]} style={{ top: nodeTop - 6 }} />}
    </div>
  )
}

function TypeIcon({ type }: { type: string }) {
  const t = type.toLowerCase()
  const cls = 'size-4 flex-none'
  if (t === 'flight') return <Plane aria-hidden className={cls} />
  if (t === 'train') return <TrainFront aria-hidden className={cls} />
  if (t === 'bus') return <Bus aria-hidden className={cls} />
  if (t === 'ferry') return <Ship aria-hidden className={cls} />
  return null
}

function LegStrip({ leg, entry, todayIso, fmt, rates, canEdit, onOpen }: {
  leg: Leg | null
  entry: TransportLeg | null
  todayIso: string
  fmt: (n: number) => string
  rates: Record<string, number>
  canEdit: boolean
  onOpen: (entry: TransportLeg | null) => void
}) {
  const wayHome = !!leg && leg.to.kind === 'home'
  if (!entry) {
    return (
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => onOpen(null)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[calc(var(--r)-6px)] border-[1.5px] border-dashed border-ac2-line px-3.5 py-2 text-left"
      >
        <span className={'min-w-0 truncate text-base font-semibold ' + (wayHome ? 'text-tx2' : 'text-ac2')}>
          {wayHome ? 'Home · not planned yet' : canEdit ? '+ Add transport' : 'No transport yet'}
        </span>
        <span className="flex-none whitespace-nowrap text-[13px] text-tx3">{wayHome ? (canEdit ? '+ Add' : '') : leg ? `${leg.from.city} → ${leg.to.city}` : ''}</span>
      </button>
    )
  }
  const booked = isBookedStatus(entry.status)
  const money = legMoneyState(entry, todayIso)
  const price = entry.price > 0 ? fmt(toBase(entry.price, entry.cur, rates)) : ''
  return (
    <button
      type="button"
      disabled={!canEdit}
      onClick={() => onOpen(entry)}
      className={
        'grid w-full grid-cols-[1fr_auto] items-center gap-x-3 rounded-[calc(var(--r)-6px)] px-3.5 py-2.5 text-left ' +
        (booked ? 'bg-ac2-soft' : 'border-[1.5px] border-dashed border-ac2-line')
      }
    >
      <span className="flex min-w-0 items-center gap-1.5 text-base font-medium text-ac2-deep">
        <TypeIcon type={entry.type} />
        <span className="truncate">
          {cap(entry.type)}
          {entry.date ? ` · ${fmtDay(entry.date)}` : ''}
          {entry.time ? ` ${entry.time}` : ''}
        </span>
      </span>
      {price ? <span className="text-base font-semibold tabular-nums">{price}</span> : <span />}
      {/* The connection is a place you pass through, drawn on the globe as a dogleg with the hours on it (#58). Its own line, so the price never squeezes it. */}
      <span className="col-span-2 block truncate text-[13px] text-tx2">
        {!leg ? `${entry.from} → ${entry.to} · ` : ''}
        {entry.via ? `via ${entry.via}${entry.hours ? ` · ${fmtHours(entry.hours)}` : ''} · ` : ''}
        <span className={TONE[money.tone]}>{money.label}</span>
      </span>
    </button>
  )
}

function StopCard({ seg, maybe, state, todayIso, canEdit, fmt, onOpen, onToggle, onStay }: {
  seg: Segment
  maybe: boolean
  state: TripState
  todayIso: string
  canEdit: boolean
  fmt: (n: number) => string
  onOpen: () => void
  onToggle: () => void
  onStay: (stay: Stay | null, range: NightRange | null) => void
}) {
  const inPlan = !maybe
  const nn = segNights(seg)
  const isCurrent = inPlan && !!seg.arrive && !!seg.depart && seg.arrive <= todayIso && todayIso < seg.depart
  const prog = isCurrent && nn > 0 ? stopProgress(seg, todayIso) : null
  const stays = state.stays.filter((x) => x.segId === seg.id)
  const cov = stopCoverage(seg, stays)
  const uncounted = stays.filter((x) => !stayCounts(x))
  const row = 'flex w-full items-center justify-between gap-3 py-2.5 text-left'
  return (
    <div
      role={canEdit ? 'button' : undefined}
      tabIndex={canEdit ? 0 : undefined}
      onClick={canEdit ? onOpen : undefined}
      onKeyDown={canEdit ? (e) => { if (e.key === 'Enter') onOpen() } : undefined}
      className={'lv-enter rounded-[var(--r)] bg-sf p-[18px] ' + (canEdit ? 'cursor-pointer ' : '') + (inPlan ? '' : 'opacity-60')}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-label="Include in plan"
          aria-pressed={inPlan}
          disabled={!canEdit}
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          className={tickBtn}
        >
          <span aria-hidden className={tick(inPlan)}>✓</span>
        </button>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[18px] font-semibold">{seg.city}</span>
          <span className="block text-base text-tx2">
            {seg.country ? `${seg.country} · ` : ''}{fmtDay(seg.arrive)} → {fmtDay(seg.depart)}
          </span>
        </span>
        <span className="flex-none text-right">
          <span className="block text-[19px] font-semibold">{nn}</span>
          <span className="block text-base uppercase tracking-[.08em] text-tx2">nights</span>
        </span>
      </div>
      {prog && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-track">
          <span className="block h-full rounded-full bg-ac" style={{ width: prog.pct + '%' }} />
        </div>
      )}
      <div className="mt-3 divide-y divide-ln border-t border-ln">
        {cov.covered.map(({ stay, range }) => {
          const money = stayMoneyState(stay, todayIso)
          const total = toBase(stayTotal(stay, seg), stay.cur, state.rates)
          return (
            <button key={stay.id} type="button" disabled={!canEdit} onClick={(e) => { e.stopPropagation(); onStay(stay, null) }} className={row}>
              <span className="min-w-0">
                <span className="block truncate text-base font-medium">{stay.name || 'Stay'}</span>
                <span className="block text-[13px] text-tx2">
                  {fmtDay(range.from)} – {fmtDay(range.to)} · {range.nights} {range.nights === 1 ? 'night' : 'nights'} · <span className={TONE[money.tone]}>{money.label}</span>
                </span>
              </span>
              {total > 0 && <span className="flex-none text-base font-semibold tabular-nums">{fmt(total)}</span>}
            </button>
          )
        })}
        {uncounted.map((stay) => (
          <button key={stay.id} type="button" disabled={!canEdit} onClick={(e) => { e.stopPropagation(); onStay(stay, null) }} className={row + ' opacity-55'}>
            <span className="min-w-0">
              <span className="block truncate text-base font-medium">{stay.name || 'Stay'}</span>
              <span className="block text-[13px] text-tx2">old option · not counted</span>
            </span>
          </button>
        ))}
        {inPlan && cov.gaps.map((g) => (
          <button key={g.from} type="button" disabled={!canEdit} onClick={(e) => { e.stopPropagation(); onStay(null, g) }} className={row + ' text-warn'}>
            <span className="text-base font-medium">No bed {fmtDay(g.from)} → {fmtDay(g.to)}</span>
            <span className="text-[13px]">{g.nights} {g.nights === 1 ? 'night' : 'nights'}</span>
          </button>
        ))}
        {cov.overlaps.map((o) => (
          <div key={o.from} className="py-2 text-[13px] font-medium text-warn">
            Two stays overlap {fmtDay(o.from)} – {fmtDay(o.to)} · {o.nights} {o.nights === 1 ? 'night' : 'nights'} counted twice
          </div>
        ))}
        {!stays.length && (
          <div className={'py-2.5 text-base font-medium ' + (inPlan ? 'text-warn' : 'text-tx3')}>{inPlan ? 'No stay yet' : 'Nights not counted'}</div>
        )}
      </div>
      {canEdit && inPlan && (
        <div className="mt-1 flex justify-end">
          <button type="button" onClick={(e) => { e.stopPropagation(); onStay(null, cov.covered.length ? (cov.gaps[0] ?? null) : null) }} className="-my-2.5 inline-flex min-h-11 items-center text-base font-semibold text-ac2">
            + Add stay
          </button>
        </div>
      )}
    </div>
  )
}

export function Timeline() {
  const { trip, cities, cityIdx } = useTripScreen()
  const mut = useTripMutation()
  const { canEdit } = useTripRole()
  const confirm = useConfirm()
  const { fmt } = useMoney()
  const [sheet, setSheet] = useState<SheetState>(null)
  const todayIso = localISODate()
  const state = trip.data?.state
  const tl = useMemo(() => (state ? buildTimeline(state) : null), [state])
  const maybes = useMemo(
    () => (state ? state.segments.filter((x) => x.include === false).slice().sort((a, b) => a.arrive.localeCompare(b.arrive)) : []),
    [state],
  )
  const rows = useMemo(() => (tl ? railRows(tl, maybes) : []), [tl, maybes])

  if (trip.isPending) return <main className="mx-auto max-w-5xl p-6">Loading…</main>
  if (!trip.data || !state || !tl) return <CreateTripEmptyState />
  const s = state
  const currencies = Object.keys(s.rates)

  const day = tripDay(s.meta, todayIso)
  const { current } = stopsAround(s, todayIso)
  const prog = current ? stopProgress(current, todayIso) : null
  const after = !!s.meta.endDate && todayIso > s.meta.endDate
  const kickerText = !day
    ? s.meta.startDate ? `Leaves ${fmtDay(s.meta.startDate)}` : ''
    : after ? 'Home again' : `Day ${day}${current && prog ? ` · ${current.city}, night ${prog.night}` : ' · between stops'}`
  const placedNights = tl.stops.reduce((a, x) => a + segNights(x), 0)
  const tripNights = nightsBetween(s.meta.startDate, s.meta.endDate)
  const defaultArrive = tl.stops.length ? tl.stops[tl.stops.length - 1].depart : s.meta.startDate || ''
  const nextCityOf = (seg: Segment | null) => {
    const leg = seg ? tl.legs.find((l) => l.from.seg?.id === seg.id) : undefined
    return leg ? (leg.to.kind === 'home' ? 'home' : leg.to.city) : undefined
  }
  const close = () => setSheet(null)

  const saveStop = (seg: Segment, previous: Segment | null) => {
    mut.mutate((st) => ({
      ...st,
      segments: st.segments.some((x) => x.id === seg.id) ? st.segments.map((x) => (x.id === seg.id ? seg : x)) : [...st.segments, seg],
      // Moving Leave moves the leg after this stop with it (mock 15 §4).
      transport: previous ? shiftDepartures(st.transport, previous.city, previous.depart, seg.depart) : st.transport,
    }))
    close()
  }
  const deleteStop = async (seg: Segment) => {
    const ok = await confirm({
      title: `Delete ${seg.city || 'this stop'}?`,
      body: 'Its stays and transport stay on the trip; the legs on either side become one.',
    })
    if (!ok) return
    mut.mutate((st) => ({ ...st, segments: st.segments.filter((x) => x.id !== seg.id) }))
    close()
  }
  const toggleStop = (id: string) =>
    mut.mutate((st) => ({ ...st, segments: st.segments.map((x) => (x.id === id ? { ...x, include: x.include === false } : x)) }))
  const saveStay = (stay: Stay) => {
    mut.mutate((st) => ({
      ...st,
      stays: st.stays.some((x) => x.id === stay.id) ? st.stays.map((x) => (x.id === stay.id ? stay : x)) : [...st.stays, stay],
    }))
    close()
  }
  const deleteStay = async (id: string) => {
    if (!(await confirm({ title: 'Delete this stay?' }))) return
    mut.mutate((st) => ({ ...st, stays: st.stays.filter((x) => x.id !== id) }))
    close()
  }
  const saveLeg = (t: TransportLeg) => {
    mut.mutate((st) => ({
      ...st,
      transport: st.transport.some((x) => x.id === t.id) ? st.transport.map((x) => (x.id === t.id ? t : x)) : [...st.transport, t],
    }))
    close()
  }
  const removeLeg = async (id: string) => {
    if (!(await confirm({ title: 'Remove this transport?', confirmLabel: 'Remove' }))) return
    mut.mutate((st) => ({ ...st, transport: st.transport.filter((x) => x.id !== id) }))
    close()
  }
  const openStay = (seg: Segment) => (stay: Stay | null, range: NightRange | null) => setSheet({ kind: 'stay', seg, stay, range })

  return (
    <main className="mx-auto max-w-xl px-[18px] pb-28 pt-[18px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {kickerText && <div className="text-[12px] font-semibold uppercase tracking-[.12em] text-ac2-deep">{kickerText}</div>}
          <h1 className="truncate font-serif text-[25px] font-semibold">{s.meta.tripName || 'Trip'}</h1>
        </div>
        {/* Trip settings' only door — the gear (nav "1g"): dates, currency, cap, partners, sharing, delete or leave. */}
        <Link href="/settings" aria-label="Trip settings" className="flex h-[44px] w-[44px] flex-none items-center justify-center rounded-full border border-ln2 bg-sf text-tx2">
          <Settings aria-hidden className="size-5" strokeWidth={2} />
        </Link>
      </div>
      <NewCountryBanner state={s} />
      <ViewerNotice />
      <SaveError show={mut.isError} error={mut.error} />

      <ol className="mt-3 flex flex-col">
        {rows.map((r) => {
          if (r.t === 'home') {
            const start = r.pos === 'start'
            return (
              <li key={'home-' + r.pos} className="flex gap-3">
                <Rail line="solid" node="home" clipTop={start} clipBottom={!start} nodeTop={14} />
                <div className="min-w-0 flex-1 py-1 text-base font-medium text-tx2">
                  {start
                    ? tl.home ? `Home · ${tl.home}` : <Link href="/settings" className="text-ac2">Home · set where you live in Trip settings</Link>
                    : `Home again${s.meta.endDate ? ` · ${fmtDay(s.meta.endDate)}` : ' · no date yet'}`}
                </div>
              </li>
            )
          }
          if (r.t === 'leg') {
            const leg = r.leg
            const entries: (TransportLeg | null)[] = leg.transport.length ? leg.transport : [null]
            return (
              <li key={leg.key} className="flex gap-3">
                <Rail line={leg.booked ? 'booked' : 'dashed'} />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-1.5">
                  {entries.map((entry, i) => (
                    <LegStrip key={entry?.id ?? 'empty-' + i} leg={leg} entry={entry} todayIso={todayIso} fmt={fmt} rates={s.rates} canEdit={canEdit} onOpen={(e) => setSheet({ kind: 'leg', leg, entry: e })} />
                  ))}
                </div>
              </li>
            )
          }
          if (r.t === 'add') {
            if (!canEdit) return null
            return (
              <li key="add" className="flex gap-3">
                <Rail line="solid" node="add" nodeTop={20} />
                <div className="min-w-0 flex-1 py-1">
                  <button type="button" onClick={() => setSheet({ kind: 'stop', seg: null })} className="inline-flex min-h-11 items-center text-base font-semibold text-ac2">
                    + Add stop
                  </button>
                </div>
              </li>
            )
          }
          const seg = r.seg
          const isCurrent = !r.maybe && !!seg.arrive && !!seg.depart && seg.arrive <= todayIso && todayIso < seg.depart
          return (
            <li key={seg.id} className="flex gap-3">
              <Rail line="solid" node={r.maybe ? 'maybe' : isCurrent ? 'current' : 'stop'} nodeTop={36} />
              <div className="min-w-0 flex-1 py-1.5">
                <StopCard
                  seg={seg}
                  maybe={r.maybe}
                  state={s}
                  todayIso={todayIso}
                  canEdit={canEdit}
                  fmt={fmt}
                  onOpen={() => setSheet({ kind: 'stop', seg })}
                  onToggle={() => toggleStop(seg.id)}
                  onStay={openStay(seg)}
                />
              </div>
            </li>
          )
        })}
      </ol>

      {tl.stops.length > 0 && (
        <div className="mt-2 flex items-center justify-between rounded-[var(--r)] bg-sf p-4">
          <span className="text-base font-medium text-tx2">
            {tripNights > 0 ? `${placedNights} of ${tripNights} nights placed` : `${placedNights} ${placedNights === 1 ? 'night' : 'nights'} placed`}
          </span>
        </div>
      )}
      {!tl.stops.length && !maybes.length && (
        <div className="mt-2 rounded-[var(--r)] bg-sf p-[18px] text-base text-tx2">{canEdit ? 'No stops yet. Add your first one.' : 'No stops yet.'}</div>
      )}

      {tl.orphans.length > 0 && (
        <section className="mt-5">
          <div className={kicker}>Transport not on a leg</div>
          <p className={'mt-1 mb-2 text-[13px] text-tx2'}>
            A leg runs between two stops that follow each other. These go to or from a city that is not a stop yet; tap one to add that stop or to move it onto a leg.
          </p>
          <div className="flex flex-col gap-1.5">
            {tl.orphans.map((t) => (
              <LegStrip key={t.id} leg={null} entry={t} todayIso={todayIso} fmt={fmt} rates={s.rates} canEdit={canEdit} onOpen={(e) => setSheet({ kind: 'leg', leg: null, entry: e })} />
            ))}
          </div>
        </section>
      )}

      {sheet?.kind === 'stop' && (
        <StopSheet
          initial={sheet.seg}
          prefill={sheet.prefill}
          cities={cities.data ?? []}
          stays={sheet.seg ? s.stays.filter((x) => x.segId === sheet.seg!.id) : []}
          cityCost={sheet.seg ? cityIdx[sheet.seg.city] : undefined}
          rates={s.rates}
          nextCity={nextCityOf(sheet.seg)}
          defaultArrive={defaultArrive}
          todayIso={todayIso}
          onClose={close}
          onSave={saveStop}
          onDelete={sheet.seg ? () => deleteStop(sheet.seg!) : undefined}
          onOpenStay={(stay) => setSheet({ kind: 'stay', seg: sheet.seg!, stay, range: null })}
          onAddStay={() => {
            const seg = sheet.seg!
            const cov = stopCoverage(seg, s.stays.filter((x) => x.segId === seg.id))
            setSheet({ kind: 'stay', seg, stay: null, range: cov.covered.length ? (cov.gaps[0] ?? null) : null })
          }}
        />
      )}
      {sheet?.kind === 'stay' && (
        <StaySheet initial={sheet.stay} seg={sheet.seg} range={sheet.range} rates={s.rates} currencies={currencies} onClose={close} onSave={saveStay} onDelete={sheet.stay ? deleteStay : undefined} />
      )}
      {sheet?.kind === 'leg' && (
        <LegSheet
          leg={sheet.leg}
          initial={sheet.entry}
          rates={s.rates}
          currencies={currencies}
          legs={tl.legs}
          stops={tl.stops}
          onClose={close}
          onSave={saveLeg}
          onRemove={sheet.entry ? removeLeg : undefined}
          onAddStop={(prefill) => setSheet({ kind: 'stop', seg: null, prefill })}
        />
      )}
    </main>
  )
}
