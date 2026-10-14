'use client'
import type { CityLite } from '@/lib/catalogue/types'
import type { CityCost } from '@/lib/trips/budget'
import { stopCoverage, type Leg, type NightRange, type Timeline as TimelineModel } from '@/lib/trips/timeline'
import type { Segment, Stay, TransportLeg, TripState } from '@/lib/trips/types'
import { StopSheet } from './StopSheet'
import { StaySheet } from './StaySheet'
import { LegSheet } from './LegSheet'
import { FlightThereSheet } from './FlightThereSheet'
import type { TripEdits } from './useTripEdits'

// Which form is open, and the forms themselves (the phone's EditTarget and
// EditSheet): the timeline and the stop page both hold a SheetState and
// render this, so a stay opened from either place is the same form.

export type SheetState =
  | { kind: 'stop'; seg: Segment | null; prefill?: { city: string; arrive?: string } }
  | { kind: 'stay'; seg: Segment; stay: Stay | null; range: NightRange | null }
  | { kind: 'leg'; leg: Leg | null; entry: TransportLeg | null; prefill?: { from: string; to: string; date?: string } }
  | { kind: 'flightThere' }
  | null

/** "Add stay" for a stop: the first gap once it has stays, else the stop's own dates. */
export const addStaySheet = (seg: Segment, state: TripState): SheetState => {
  const cov = stopCoverage(seg, state.stays.filter((x) => x.segId === seg.id))
  return { kind: 'stay', seg, stay: null, range: cov.covered.length ? (cov.gaps[0] ?? null) : null }
}

export function TripSheets({ sheet, setSheet, state, tl, cities, cityIdx, todayIso, edits, onStopDeleted }: {
  sheet: SheetState
  setSheet: (s: SheetState) => void
  state: TripState
  tl: TimelineModel
  cities: CityLite[]
  cityIdx: Record<string, CityCost | undefined>
  todayIso: string
  edits: TripEdits
  /** the stop page: its stop is gone, go back */
  onStopDeleted?: (seg: Segment) => void
}) {
  const s = state
  const close = () => setSheet(null)
  const currencies = Object.keys(s.rates)
  const defaultArrive = tl.stops.length ? tl.stops[tl.stops.length - 1].depart : s.meta.startDate || ''
  const nextCityOf = (seg: Segment | null) => {
    const leg = seg ? tl.legs.find((l) => l.from.seg?.id === seg.id) : undefined
    return leg ? (leg.to.kind === 'home' ? 'home' : leg.to.city) : undefined
  }
  if (!sheet) return null
  return (
    <>
      {sheet.kind === 'stop' && (
        <StopSheet
          initial={sheet.seg}
          prefill={sheet.prefill}
          cities={cities}
          stays={sheet.seg ? s.stays.filter((x) => x.segId === sheet.seg!.id) : []}
          cityCost={sheet.seg ? cityIdx[sheet.seg.city] : undefined}
          rates={s.rates}
          nextCity={nextCityOf(sheet.seg)}
          defaultArrive={defaultArrive}
          todayIso={todayIso}
          onClose={close}
          onSave={(seg, previous) => { edits.saveStop(seg, previous); close() }}
          onDelete={sheet.seg ? async () => { const seg = sheet.seg!; if (await edits.deleteStop(seg)) { close(); onStopDeleted?.(seg) } } : undefined}
          onOpenStay={(stay) => setSheet({ kind: 'stay', seg: sheet.seg!, stay, range: null })}
          onAddStay={() => setSheet(addStaySheet(sheet.seg!, s))}
        />
      )}
      {sheet.kind === 'stay' && (
        <StaySheet
          initial={sheet.stay}
          seg={sheet.seg}
          range={sheet.range}
          rates={s.rates}
          currencies={currencies}
          onClose={close}
          onSave={(stay) => { edits.saveStay(stay); close() }}
          onDelete={sheet.stay ? async (id) => { if (await edits.deleteStay(id)) close() } : undefined}
        />
      )}
      {sheet.kind === 'flightThere' && (
        <FlightThereSheet
          home={tl.home}
          onClose={close}
          onNext={(from, to) => setSheet({ kind: 'leg', leg: null, entry: null, prefill: { from, to, date: s.meta.startDate || '' } })}
        />
      )}
      {sheet.kind === 'leg' && (
        <LegSheet
          leg={sheet.leg}
          initial={sheet.entry}
          prefill={sheet.prefill}
          rates={s.rates}
          currencies={currencies}
          legs={tl.legs}
          stops={tl.stops}
          onClose={close}
          onSave={(t) => {
            edits.saveLeg(t)
            // The flight there is saved: its stop's form opens with the place and the day filled in.
            if (sheet.prefill) setSheet({ kind: 'stop', seg: null, prefill: { city: t.to, arrive: t.date || s.meta.startDate || undefined } })
            else close()
          }}
          onRemove={sheet.entry ? async (id) => { if (await edits.removeLeg(id)) close() } : undefined}
          onAddStop={(prefill) => setSheet({ kind: 'stop', seg: null, prefill })}
        />
      )}
    </>
  )
}
