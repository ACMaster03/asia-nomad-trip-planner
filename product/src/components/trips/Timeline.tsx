'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Bus, Plane, Plus, Settings, Ship, TrainFront } from 'lucide-react'
import NewCountryBanner from './NewCountryBanner'
import { PageHeader } from '@/components/ui/PageHeader'
import { IconButton } from '@/components/ui/IconButton'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { useTripRole } from '@/lib/trips/useTripRole'
import { useHomeBase } from '@/lib/trips/useHomeBase'
import { useMoney } from '@/lib/trips/Money'
import { useConfirm } from '@/components/Confirm'
import { localISODate, nightsBetween, segNights, stayTotal, toBase } from '@/lib/trips/format'
import { isBookedStatus } from '@/lib/trips/commitment'
import { stopProgress, tripDay } from '@/lib/trips/progress'
import { tripPhase } from '@/lib/trips/recap'
import { stopsAround } from '@/lib/trips/whereAmI'
import { sameCity } from '@/lib/map/norm'
import {
  buildTimeline, homeFor, journeyRecap, legMoneyState, onward as isOnward, shiftDepartures, stayCounts, stayMoneyState, stayName, stopCoverage,
  type Leg, type NightRange, type Timeline as TimelineModel, type Tone,
} from '@/lib/trips/timeline'
import type { Segment, Stay, TransportLeg, TripState } from '@/lib/trips/types'
import { SaveError } from './SaveError'
import { ViewerNotice } from './ViewerNotice'
import CreateTripEmptyState from './CreateTripEmptyState'
import { Modal } from './Modal'
import { OnboardingWizard } from './OnboardingWizard'
import { StopSheet } from './StopSheet'
import { StaySheet } from './StaySheet'
import { LegSheet } from './LegSheet'
import { FlightThereSheet } from './FlightThereSheet'
import { fmtDay, fmtHours, kicker } from './sheetKit'

// Trip as ONE timeline (mock 15 §1, #58): home, leg, stop, leg, stop … home,
// in date order, no tabs. The rail on the left is the journey. Since round 3a
// of the redesign (docs/WEB-IOS-REDESIGN.md) it is drawn as the phone's
// TripScreens.swift draws it:
//
// - Home is the first and the last node, hollow, with nothing to edit here.
//   The end reads "Journey ends · 30 Apr" while the plan stops short of the
//   end date and "Home · 30 Apr" once a stop reaches it (Patrik, 27 Sep).
// - A leg is the strip between two stops and the only place transport is
//   entered. Legs are pale mauve, the app's transport colour, and stops are
//   white cards, so a full list still reads at a glance. A booked leg is
//   solid and shows its price and paid state; an unbooked one is dashed, and
//   the rail goes dashed there too. The way home is "Onward" or "Going home".
// - A stop card: the city in the serif, the country and the dates a row each,
//   the nights on the right, the stays underneath, one row per stay with its
//   nights, its money state and its total. No tick box: "In the plan" is a
//   switch in the stop's form, and a maybe shows faded. Tapping the card
//   opens the form (until round 3c brings the stop page).
// - "No bed 30 Nov → 13 Dec" is the amber row inside a stop, a warning, and
//   tapping it opens Add stay with those dates already in.
// - "+ Add stop" is a dashed row after the last stop, before the way home.
// - After the journey a "Where next?" card on the wash points forward, with
//   "Look back ›" to the timeline below. With no stops, the no-stops card
//   offers the first stop, or the flight there first.
// - Copy diet (#65): nothing on this screen explains itself.

type SheetState =
  | { kind: 'stop'; seg: Segment | null; prefill?: { city: string; arrive?: string } }
  | { kind: 'stay'; seg: Segment; stay: Stay | null; range: NightRange | null }
  | { kind: 'leg'; leg: Leg | null; entry: TransportLeg | null; prefill?: { from: string; to: string; date?: string } }
  | { kind: 'flightThere' }
  | null

type Row =
  | { t: 'home'; pos: 'start' | 'end' }
  | { t: 'leg'; leg: Leg }
  | { t: 'stop'; seg: Segment; maybe: boolean }
  | { t: 'add' }

// The rail, top to bottom. Unticked stops sit where their dates put them,
// faded, with no leg of their own; "+ Add stop" sits above the way home. With
// nothing on the timeline the no-stops card offers the first stop instead.
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
    if (tl.stops.length || maybes.length) out.push({ t: 'add' })
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
} as const
/** The phone's TripPillButtonStyle: accent, full round, sized to its words. */
const pill = 'inline-flex min-h-11 items-center gap-1.5 rounded-full bg-ac px-[18px] text-[15px] font-semibold text-on'
const dashed = 'rounded-[calc(var(--r)-6px)] border-[1.5px] border-dashed'
const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t)
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : one + 's'}`

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

function LegStrip({ leg, entry, todayIso, fmt, rates, canEdit, onward, onOpen }: {
  leg: Leg | null
  entry: TransportLeg | null
  todayIso: string
  fmt: (n: number) => string
  rates: Record<string, number>
  canEdit: boolean
  onward: boolean
  onOpen: (entry: TransportLeg | null) => void
}) {
  const wayHome = !!leg && leg.to.kind === 'home'
  if (!entry) {
    // The phone's EmptyLegStrip: the route under the words, not beside them.
    return (
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => onOpen(null)}
        className={'flex min-h-11 w-full items-center justify-between gap-2 border-ac2-line px-3.5 py-2 text-left ' + dashed}
      >
        <span className="min-w-0">
          <span className={'block truncate text-base font-semibold ' + (wayHome ? 'text-tx2' : 'text-ac2')}>
            {wayHome ? (onward ? 'Onward' : 'Going home') : 'No transport yet'}
          </span>
          {!wayHome && leg && <span className="block truncate text-[13px] text-tx2">{leg.from.city} → {leg.to.city}</span>}
        </span>
        {wayHome && canEdit && <span className="flex-none text-[15px] font-semibold text-ac">+ Add</span>}
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

/** The phone's StopCard: the city, the country and the dates a row each, the nights on the right, the stays underneath. */
function StopCard({ seg, maybe, state, todayIso, canEdit, fmt, onOpen, onStay }: {
  seg: Segment
  maybe: boolean
  state: TripState
  todayIso: string
  canEdit: boolean
  fmt: (n: number) => string
  onOpen: () => void
  onStay: (stay: Stay | null, range: NightRange | null) => void
}) {
  const inPlan = !maybe
  const nn = segNights(seg)
  const undated = !seg.arrive && !seg.depart
  // "0 nights" says nothing while a date is still missing.
  const showNights = !(nn === 0 && (!seg.arrive || !seg.depart))
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
      className={'lv-enter rounded-[var(--r)] bg-sf p-[18px] text-tx ' + (canEdit ? 'cursor-pointer ' : '') + (inPlan ? '' : 'opacity-60')}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate font-serif text-[21px] font-semibold leading-tight">{seg.city || 'Stop'}</span>
          {seg.country && <span className="mt-0.5 block truncate text-[15px] text-tx2">{seg.country}</span>}
          <span className="block truncate text-[15px] text-tx2">{undated ? 'No dates yet' : `${fmtDay(seg.arrive)} → ${fmtDay(seg.depart)}`}</span>
        </span>
        {showNights && (
          <span className="flex-none text-right">
            <span className="block text-[19px] font-semibold leading-tight tabular-nums">{nn}</span>
            <span className="block text-[13px] uppercase tracking-[.08em] text-tx2">{nn === 1 ? 'night' : 'nights'}</span>
          </span>
        )}
      </div>
      {prog && (
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-track">
          <span className="lv-grow block h-full rounded-full bg-ac" style={{ width: prog.pct + '%' }} />
        </div>
      )}
      <div className="mt-3 divide-y divide-ln border-t border-ln">
        {cov.covered.map(({ stay, range }) => {
          const money = stayMoneyState(stay, todayIso)
          const total = toBase(stayTotal(stay, seg), stay.cur, state.rates)
          return (
            <button key={stay.id} type="button" disabled={!canEdit} onClick={(e) => { e.stopPropagation(); onStay(stay, null) }} className={row}>
              <span className="min-w-0">
                <span className="block truncate text-base font-medium">{stayName(stay, seg)}</span>
                <span className="block text-[13px] text-tx2">
                  {fmtDay(range.from)} – {fmtDay(range.to)} · {plural(range.nights, 'night')} · <span className={TONE[money.tone]}>{money.label}</span>
                  {/* A stop out of the plan still owes its booked stays (#105): Money counts them until cancelled. */}
                  {!inPlan && isBookedStatus(stay.status) && <span className="text-warn"> · still in Bookings</span>}
                </span>
              </span>
              {total > 0 && <span className="flex-none text-base font-semibold tabular-nums">{fmt(total)}</span>}
            </button>
          )
        })}
        {uncounted.map((stay) => (
          <button key={stay.id} type="button" disabled={!canEdit} onClick={(e) => { e.stopPropagation(); onStay(stay, null) }} className={row + ' opacity-55'}>
            <span className="min-w-0">
              <span className="block truncate text-base font-medium">{stayName(stay, seg)}</span>
              <span className="block text-[13px] text-tx2">old option · not counted</span>
            </span>
          </button>
        ))}
        {inPlan && cov.gaps.map((g) => (
          <button key={g.from} type="button" disabled={!canEdit} onClick={(e) => { e.stopPropagation(); onStay(null, g) }} className={row + ' text-warn'}>
            <span className="text-base font-medium">No bed {fmtDay(g.from)} → {fmtDay(g.to)}</span>
            <span className="text-[13px]">{plural(g.nights, 'night')}</span>
          </button>
        ))}
        {cov.overlaps.map((o) => (
          <div key={o.from} className="py-2 text-[13px] font-medium text-warn">
            Two stays overlap {fmtDay(o.from)} – {fmtDay(o.to)} · {plural(o.nights, 'night')} counted twice
          </div>
        ))}
        {!stays.length && (
          <div className={'py-2.5 text-base font-medium ' + (inPlan ? 'text-warn' : 'text-tx3')}>{inPlan ? 'No stay yet' : 'Nights not counted'}</div>
        )}
      </div>
    </div>
  )
}

/** State F (the phone's FinishedJourneyCard): the journey has ended. Points forward; the timeline stays below. */
function FinishedJourneyCard({ name, state, canEdit, onPlanNext, onLookBack }: {
  name: string
  state: TripState
  canEdit: boolean
  onPlanNext: () => void
  onLookBack: () => void
}) {
  const r = journeyRecap(state)
  const box = (n: number, label: string) => (
    <div className="min-w-0 flex-1 rounded-[12px] bg-fill px-2.5 py-2">
      <div className="text-[17px] font-semibold leading-tight tabular-nums">{n}</div>
      <div className="text-[12px] leading-tight text-tx2">{label}</div>
    </div>
  )
  const eyebrow = 'text-[12px] font-semibold uppercase tracking-[.1em] text-tx2'
  return (
    <div className="mb-6 flex flex-col gap-2.5">
      <div className="lv-enter rounded-[var(--r)] px-[18px] py-[22px] text-tx lv-journey-wash">
        <div className={eyebrow}>{name} · {fmtDay(state.meta.startDate)} – {fmtDay(state.meta.endDate)}</div>
        <div className="mt-1.5 font-serif text-[26px] font-semibold leading-tight">Where next?</div>
        <p className="mt-1.5 text-[15px] leading-snug text-tx2">{name} is behind you.{canEdit ? ' Start planning the next one.' : ''}</p>
        <div className="mt-3 flex gap-2">
          {box(r.nights, 'nights')}
          {box(r.stops, 'stops')}
          {box(r.countries, 'countries')}
        </div>
        {canEdit && (
          <button type="button" onClick={onPlanNext} className={pill + ' mt-4'}>
            <Plus aria-hidden className="size-4" strokeWidth={2.6} /> Plan the next journey
          </button>
        )}
      </div>
      <button type="button" onClick={onLookBack} className="rounded-[var(--r)] bg-sf p-4 text-left text-tx">
        <span className="flex items-center justify-between gap-3">
          <span className={'min-w-0 truncate ' + eyebrow}>{name}</span>
          <span className="flex-none text-[15px] font-semibold text-ac">Look back ›</span>
        </span>
        <span className="mt-1.5 block text-[14px] text-tx2">The timeline and its stays, kept as they were.</span>
      </button>
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
  const [wizardOpen, setWizardOpen] = useState(false)
  const todayIso = localISODate()
  const state = trip.data?.state
  // Home is the viewer's own (#58, migration 43), else the journey's.
  const profileHome = useHomeBase().data
  const tl = useMemo(() => (state ? buildTimeline(state, homeFor(profileHome, state.meta)) : null), [state, profileHome])
  const maybes = useMemo(
    () => (state ? state.segments.filter((x) => x.include === false).slice().sort((a, b) => a.arrive.localeCompare(b.arrive)) : []),
    [state],
  )
  const rows = useMemo(() => (tl ? railRows(tl, maybes) : []), [tl, maybes])

  if (trip.isPending) return <main className="mx-auto max-w-5xl p-6">Loading…</main>
  if (!trip.data || !state || !tl) return <CreateTripEmptyState />
  const s = state
  const currencies = Object.keys(s.rates)
  const name = s.meta.tripName || 'Your journey'

  const day = tripDay(s.meta, todayIso)
  const { current } = stopsAround(s, todayIso)
  const prog = current ? stopProgress(current, todayIso) : null
  const after = tripPhase(s, todayIso) === 'post'
  const kickerText = !day
    ? s.meta.startDate ? `Leaves ${fmtDay(s.meta.startDate)}` : ''
    : after ? 'Home again' : `Day ${day}${current && prog ? ` · ${current.city}, night ${prog.night}` : ' · between stops'}`
  const onward = isOnward(s.meta, tl)
  const placedNights = tl.stops.reduce((a, x) => a + segNights(x), 0)
  const tripNights = nightsBetween(s.meta.startDate, s.meta.endDate)
  const noStops = !tl.stops.length && !maybes.length
  // A leg already going somewhere from home: the flight there, saved before its stop.
  const landed = noStops ? s.transport.find((t) => t.to.trim() && !sameCity(t.to, tl.home)) : undefined
  const defaultArrive = tl.stops.length ? tl.stops[tl.stops.length - 1].depart : s.meta.startDate || ''
  const nextCityOf = (seg: Segment | null) => {
    const leg = seg ? tl.legs.find((l) => l.from.seg?.id === seg.id) : undefined
    return leg ? (leg.to.kind === 'home' ? 'home' : leg.to.city) : undefined
  }
  const close = () => setSheet(null)
  const lookBack = () => {
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById('timeline')?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
  }

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
  // The first stop, with the place the flight there lands already filled in.
  const addFirstStop = () =>
    setSheet(landed ? { kind: 'stop', seg: null, prefill: { city: landed.to, arrive: (landed.date ?? '').slice(0, 10) || undefined } } : { kind: 'stop', seg: null })

  return (
    <main className="mx-auto max-w-xl px-4 pb-28 pt-[18px]">
      {after && (
        <FinishedJourneyCard name={name} state={s} canEdit={canEdit} onPlanNext={() => setWizardOpen(true)} onLookBack={lookBack} />
      )}
      {/* The phone's TripHeader: the kicker, the name, and Trip settings' only door — the
          gear (nav "1g"): dates, currency, cap, partners, sharing, delete or leave. */}
      <div id="timeline" className="scroll-mt-4">
        <PageHeader
          eyebrow={kickerText}
          tone="mauve"
          title={s.meta.tripName || 'Trip'}
          truncate
          right={
            <IconButton href="/settings" label="Trip settings">
              <Settings aria-hidden className="size-[18px]" strokeWidth={2.2} />
            </IconButton>
          }
        />
      </div>
      <NewCountryBanner state={s} />
      <ViewerNotice />
      <SaveError show={mut.isError} error={mut.error} />

      <ol className="mt-3 flex flex-col">
        {rows.map((r) => {
          if (r.t === 'home') {
            const start = r.pos === 'start'
            const end = s.meta.endDate ? fmtDay(s.meta.endDate) : 'no date yet'
            return (
              <li key={'home-' + r.pos} className="flex gap-3">
                <Rail line="solid" node="home" clipTop={start} clipBottom={!start} nodeTop={14} />
                <div className="min-w-0 flex-1 py-1 text-base font-medium text-tx2">
                  {start
                    ? tl.home
                      ? `Home · ${tl.home}`
                      : canEdit ? <Link href="/settings" className="text-ac2">Home · set where you live in Trip settings</Link> : 'Home'
                    : onward ? `Journey ends · ${end}` : `Home · ${end}`}
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
                    <LegStrip key={entry?.id ?? 'empty-' + i} leg={leg} entry={entry} todayIso={todayIso} fmt={fmt} rates={s.rates} canEdit={canEdit} onward={onward} onOpen={(e) => setSheet({ kind: 'leg', leg, entry: e })} />
                  ))}
                </div>
              </li>
            )
          }
          if (r.t === 'add') {
            if (!canEdit) return null
            return (
              <li key="add" className="flex gap-3">
                <Rail line="solid" />
                <div className="min-w-0 flex-1 py-1.5">
                  <button type="button" onClick={() => setSheet({ kind: 'stop', seg: null })} className={'flex min-h-11 w-full items-center gap-2 border-ac-line px-3.5 text-left text-base font-semibold text-ac ' + dashed}>
                    <Plus aria-hidden className="size-4" strokeWidth={2.6} /> Add stop
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
                  onStay={openStay(seg)}
                />
              </div>
            </li>
          )
        })}
      </ol>

      {noStops && (
        // State G (the phone's NoStopsCard): the frame stays, the card points to the first stop.
        <div className="mt-2 rounded-[var(--r)] bg-sf p-[18px] text-tx">
          <p className="text-base text-tx2">{canEdit ? 'No stops yet. Add the first place you’re going.' : 'No stops yet.'}</p>
          {canEdit && (
            <>
              <button type="button" onClick={addFirstStop} className={pill + ' mt-3.5'}>
                <Plus aria-hidden className="size-4" strokeWidth={2.6} /> Add the first stop
              </button>
              {!landed && (
                <button type="button" onClick={() => setSheet({ kind: 'flightThere' })} className="mt-1 flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-ac">
                  <Plus aria-hidden className="size-4" strokeWidth={2.6} /> Or start with the flight there
                </button>
              )}
            </>
          )}
        </div>
      )}
      {(tl.stops.length > 0 || (!maybes.length && tripNights > 0)) && (
        // "Planned", as Money says "days not planned yet" (Patrik, 29 Sep).
        <div className="mt-2 rounded-[var(--r)] bg-sf p-4 text-base font-medium text-tx2">
          {tripNights > 0 ? `${placedNights} of ${tripNights} nights planned` : `${plural(placedNights, 'night')} planned`}
        </div>
      )}

      {tl.orphans.length > 0 && (
        <section className="mt-5">
          <div className={kicker}>Transport not on a leg</div>
          <p className={'mt-1 mb-2 text-[13px] text-tx2'}>
            A leg runs between two stops that follow each other. These go to or from a city that is not a stop yet; tap one to add that stop or to move it onto a leg.
          </p>
          <div className="flex flex-col gap-1.5">
            {tl.orphans.map((t) => (
              <LegStrip key={t.id} leg={null} entry={t} todayIso={todayIso} fmt={fmt} rates={s.rates} canEdit={canEdit} onward={onward} onOpen={(e) => setSheet({ kind: 'leg', leg: null, entry: e })} />
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
      {sheet?.kind === 'flightThere' && (
        <FlightThereSheet
          home={tl.home}
          onClose={close}
          onNext={(from, to) => setSheet({ kind: 'leg', leg: null, entry: null, prefill: { from, to, date: s.meta.startDate || '' } })}
        />
      )}
      {sheet?.kind === 'leg' && (
        <LegSheet
          leg={sheet.leg}
          initial={sheet.entry}
          prefill={sheet.prefill}
          rates={s.rates}
          currencies={currencies}
          legs={tl.legs}
          stops={tl.stops}
          onClose={close}
          onSave={
            sheet.prefill
              // The flight there is saved: its stop's form opens with the place and the day filled in.
              ? (t) => { saveLeg(t); setSheet({ kind: 'stop', seg: null, prefill: { city: t.to, arrive: t.date || s.meta.startDate || undefined } }) }
              : saveLeg
          }
          onRemove={sheet.entry ? removeLeg : undefined}
          onAddStop={(prefill) => setSheet({ kind: 'stop', seg: null, prefill })}
        />
      )}
      {wizardOpen && (
        <Modal title="New journey" onClose={() => setWizardOpen(false)}>
          <OnboardingWizard onDone={() => setWizardOpen(false)} />
        </Modal>
      )}
    </main>
  )
}
