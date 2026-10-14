'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { Waiting } from '@/components/ui/TravelLoader'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { useTripRole } from '@/lib/trips/useTripRole'
import { useHomeBase } from '@/lib/trips/useHomeBase'
import { useMoney } from '@/lib/trips/Money'
import { localISODate, segNights } from '@/lib/trips/format'
import { stopProgress } from '@/lib/trips/progress'
import { buildTimeline, homeFor, leavingTitle, legsAround, onward as isOnward, stopDatesLine, type Leg } from '@/lib/trips/timeline'
import type { TransportLeg } from '@/lib/trips/types'
import { LegStrip } from './LegStrip'
import { StayRows } from './StayRows'
import { SaveError } from './SaveError'
import { TripSheets, type SheetState } from './TripSheets'
import { useTripEdits } from './useTripEdits'

// The stop page (round 3c, the phone's StopPage; decision 4, look first, then
// edit): the wash picture at the top with the city in the serif over it, "You're
// here · night 3 of 14" when you are, the country and the dates; then the
// stays in detail (how each is paid, a chevron, "+ Add stay"), the transport
// in ("Getting here") and out ("Leaving for Hanoi", or "Onward" / "Going
// home"), and the note. "Edit" in the corner opens the stop's form; every row
// opens its own. Tapping a card on the timeline comes here.

const sectionLabel = 'text-[11.5px] font-semibold uppercase tracking-[.113em] text-ac2'

export function StopPage({ id }: { id: string }) {
  const { trip, cities, cityIdx } = useTripScreen()
  const { canEdit } = useTripRole()
  const { fmt } = useMoney()
  const edits = useTripEdits()
  const router = useRouter()
  const [sheet, setSheet] = useState<SheetState>(null)
  const todayIso = localISODate()
  const state = trip.data?.state
  const profileHome = useHomeBase().data
  const tl = useMemo(() => (state ? buildTimeline(state, homeFor(profileHome, state.meta)) : null), [state, profileHome])
  const seg = state?.segments.find((x) => x.id === id)
  const gone = !trip.isPending && !seg
  // Deleted, here or on another device: say so, then back to the timeline (the phone's StopScreen).
  useEffect(() => {
    if (!gone) return
    const t = setTimeout(() => router.replace('/itinerary'), 900)
    return () => clearTimeout(t)
  }, [gone, router])

  if (trip.isPending) return <Waiting label="Getting your journey" />
  if (!state || !tl || !seg) {
    return <p className="px-4 py-16 text-center text-base text-tx2">This stop is no longer on the journey.</p>
  }
  const s = state
  const inPlan = seg.include !== false
  const nn = segNights(seg)
  const current = inPlan && !!seg.arrive && !!seg.depart && seg.arrive <= todayIso && todayIso < seg.depart
  const prog = current && nn > 0 ? stopProgress(seg, todayIso) : null
  const onward = isOnward(s.meta, tl)
  const { arriving, leaving } = legsAround(tl, seg.id)
  const city = seg.city || 'Stop'
  // The phone shrinks a long name to fit one line; here three steps do the same.
  const citySize = city.length > 16 ? 30 : city.length > 12 ? 36 : 44
  const legSection = (title: string, leg: Leg) => {
    const entries: (TransportLeg | null)[] = leg.transport.length ? leg.transport : [null]
    return (
      <section className="flex flex-col gap-2">
        <div className={sectionLabel}>{title}</div>
        <div className="flex flex-col gap-1.5">
          {entries.map((entry, i) => (
            <LegStrip key={entry?.id ?? 'empty-' + i} leg={leg} entry={entry} todayIso={todayIso} fmt={fmt} rates={s.rates} canEdit={canEdit} onward={onward} onOpen={(e) => setSheet({ kind: 'leg', leg, entry: e })} />
          ))}
        </div>
      </section>
    )
  }

  return (
    <>
      {/* The hero: the wash over its base colour, the canvas fading in from 45 % down, the words at the bottom. */}
      <div className="relative -mt-[env(safe-area-inset-top)] h-[calc(340px+env(safe-area-inset-top))] overflow-hidden bg-[#f0efe7] bg-[url(/wash/light.jpg)] bg-cover bg-bottom dark:bg-[#161a18] dark:bg-[url(/wash/dark.jpg)]">
        <div aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 45%, color-mix(in srgb, var(--canvas) 85%, transparent) 72%, var(--canvas) 100%)' }} />
        <div className="absolute inset-x-0 top-[env(safe-area-inset-top)] flex items-center justify-between px-4 pt-2">
          <IconButton href={'/itinerary#stop-' + seg.id} label="Back to the timeline">
            <ChevronLeft aria-hidden className="size-5" strokeWidth={2.2} />
          </IconButton>
          {canEdit && (
            <button type="button" onClick={() => setSheet({ kind: 'stop', seg })} className="min-h-11 rounded-full border border-ln2 bg-sf px-4 text-base font-semibold text-ac">
              Edit
            </button>
          )}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 px-5 pb-3">
          {prog && <div className="text-[13px] font-semibold uppercase tracking-[.092em] text-ac">You’re here · night {prog.night} of {nn}</div>}
          <h1 className="truncate font-serif font-medium leading-[1.05] text-tx" style={{ fontSize: citySize }}>{city}</h1>
          {seg.country && <div className="text-base font-medium text-tx2">{seg.country}</div>}
          <div className="text-base font-medium text-tx2">{stopDatesLine(seg)}</div>
          {!inPlan && <div className="text-[15px] text-tx2">Maybe · not in the plan</div>}
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 pb-6 pt-4">
        <SaveError show={edits.mut.isError} error={edits.mut.error} />
        <section className="flex flex-col gap-2">
          <div className={sectionLabel}>Stays</div>
          <div className="rounded-[var(--r)] bg-sf px-[18px] py-1 text-tx">
            <StayRows seg={seg} state={s} todayIso={todayIso} fmt={fmt} inPlan={inPlan} detailed canEdit={canEdit} onStay={(stay, range) => setSheet({ kind: 'stay', seg, stay, range })} />
          </div>
        </section>
        {arriving && legSection('Getting here', arriving)}
        {leaving && legSection(leavingTitle(leaving, onward), leaving)}
        {seg.notes && (
          <section className="flex flex-col gap-2">
            <div className={sectionLabel}>Notes</div>
            <div className="whitespace-pre-wrap rounded-[var(--r)] bg-sf p-[18px] text-base text-tx">{seg.notes}</div>
          </section>
        )}
      </div>

      <TripSheets sheet={sheet} setSheet={setSheet} state={s} tl={tl} cities={cities.data ?? []} cityIdx={cityIdx} todayIso={todayIso} edits={edits} onStopDeleted={() => router.replace('/itinerary')} />
    </>
  )
}
