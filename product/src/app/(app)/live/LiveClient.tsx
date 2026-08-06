'use client'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  onlineManager,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  Hourglass,
  Image as ImageIcon,
  MapPin,
  NotebookPen,
  PlaneLanding,
  SatelliteDish,
  type LucideIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { useTripScope } from '@/lib/trips/TripScope'
import { tk } from '@/lib/trips/keys'
import { nightsBetween, segNights } from '@/lib/trips/format'
import {
  deleteTripEvent,
  fetchTripEvents,
  type TripEvent,
  type TripEventKind,
} from '@/lib/trips/events'
import {
  CHECKIN_MUTATION_KEY,
  EVENT_MUTATION_KEY,
  type CheckInVars,
  type EventVars,
} from '@/lib/trips/outbox'
import { publicMediaUrl, uploadCheckinPhotos } from '@/lib/trips/media'
import { Modal } from '@/components/trips/Modal'
import { SaveError } from '@/components/trips/SaveError'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'
import { CheckInModal, type CheckInInput } from './CheckInModal'
import { EditEventModal } from './EditEventModal'
import type { Segment, Stay, TripState } from '@/lib/trips/types'

const EVENT_ICON: Record<TripEventKind, LucideIcon> = {
  checkin: MapPin,
  note: NotebookPen,
  arrived: PlaneLanding,
  media: ImageIcon,
  location: SatelliteDish,
}

// LIVHOLD vocabulary (frames 08/24): bg-sf cards, hunter=check-in, mauve=
// links/memories, amber=warn/queued. Data logic, optimistic updates and the
// offline outbox are untouched — this file only re-skins them.
const card = 'rounded-[var(--r)] bg-sf text-tx'
const pill = 'rounded-full border-[1.4px] px-2.5 py-0.5 text-base font-semibold'

// Local (device-timezone) YYYY-MM-DD — comparable to the segment date strings.
function localISODate(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const fmtDayKicker = (d: Date) =>
  d.toLocaleDateString('en-GB', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })

const fmtEventTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

const fmtShort = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

// A stay that is actually committed (StayForm statuses are idea/shortlist/
// chosen; 'booked' kept for forward-compat with the booking flow).
const bookedStay = (stays: Stay[], segId: string) =>
  stays.find(
    (st) =>
      st.segId === segId &&
      st.include !== false &&
      ['booked', 'chosen'].includes((st.status ?? '').toLowerCase()),
  )

export default function LiveClient() {
  const sb = createClient()
  const qc = useQueryClient()
  const { trip, cities } = useTripScreen()
  const { tripId } = useTripScope()

  // Everything on this screen depends on "today" → compute only after mount to
  // avoid an SSR/hydration mismatch (same pattern as DashboardClient).
  const mounted = useSyncExternalStore(subscribeNever, snapTrue, snapFalse)
  const [uid, setUid] = useState<string | null>(null)
  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const eventsKey = tk.events(tripId ?? 'none')
  const events = useQuery({
    queryKey: eventsKey,
    queryFn: () => (tripId ? fetchTripEvents(sb, tripId) : Promise.resolve([] as TripEvent[])),
  })

  // ---- mutations: append-only rows → simple optimistic prepend/remove -------
  const optimisticPrepend = async (ev: TripEvent) => {
    await qc.cancelQueries({ queryKey: eventsKey })
    const prevList = qc.getQueryData<TripEvent[]>(eventsKey)
    qc.setQueryData<TripEvent[]>(eventsKey, (list) => [ev, ...(list ?? [])])
    return { prevList }
  }
  const rollback = (_e: unknown, _v: unknown, ctx?: { prevList?: TripEvent[] }) => {
    if (ctx?.prevList) qc.setQueryData(eventsKey, ctx.prevList)
  }
  const settle = () => qc.invalidateQueries({ queryKey: eventsKey }) // delete-mutation only; inserts settle via outbox defaults
  const stamp = () => new Date().toISOString()

  // Insert mutations run through the OUTBOX defaults (lib/trips/outbox.ts):
  // no local mutationFn, so offline calls pause + persist to IndexedDB and
  // replay on reconnect/reload. Optimistic UI callbacks stay local — they only
  // matter in the live session; replays after reload just refetch the feed.
  const addCheckIn = useMutation<void, Error, CheckInVars, { prevList?: TripEvent[] }>({
    mutationKey: CHECKIN_MUTATION_KEY,
    onMutate: (v) =>
      optimisticPrepend({
        id: v.id,
        trip_id: v.tripId,
        author: uid ?? '',
        kind: 'checkin',
        payload: { placeName: v.placeName, ...(v.photos?.length ? { photos: v.photos } : {}) },
        visibility: v.visibility,
        occurred_at: stamp(),
        created_at: stamp(),
        check_in: { place_id: v.placeId, rating: v.rating, comment: v.comment.trim() || null },
      }),
    onError: rollback,
  })

  const addEvent = useMutation<void, Error, EventVars, { prevList?: TripEvent[] }>({
    mutationKey: EVENT_MUTATION_KEY,
    onMutate: (v) =>
      optimisticPrepend({
        id: v.id,
        trip_id: v.tripId,
        author: uid ?? '',
        kind: v.kind,
        payload: v.payload,
        visibility: v.visibility ?? 'trip',
        occurred_at: stamp(),
        created_at: stamp(),
        check_in: null,
      }),
    onError: rollback,
  })

  // Offline awareness: TanStack's onlineManager is the same signal that pauses
  // the outbox mutations — subscribing to it keeps banner and behavior in sync
  // (useSyncExternalStore, DashboardClient pattern; onlineManager tracks
  // navigator.onLine).
  const online = useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  )

  // Ids of queued (paused) outbox rows → the feed marks them "queued".
  const pausedIds = new Set(
    useMutationState({
      filters: {
        predicate: (m) =>
          m.state.isPaused &&
          ['outbox'].includes((m.options.mutationKey?.[0] as string) ?? ''),
      },
      select: (m) => (m.state.variables as { id?: string })?.id ?? '',
    }),
  )

  const delEvent = useMutation({
    mutationFn: (id: string) => deleteTripEvent(sb, id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: eventsKey })
      const prevList = qc.getQueryData<TripEvent[]>(eventsKey)
      qc.setQueryData<TripEvent[]>(eventsKey, (list) => (list ?? []).filter((e) => e.id !== id))
      return { prevList }
    },
    onError: rollback,
    onSettled: settle,
  })

  const [checkinOpen, setCheckinOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [editEvent, setEditEvent] = useState<TripEvent | null>(null)

  // ---- derive today's picture from the plan ---------------------------------
  const s = trip.data?.state
  const derived = useMemo(() => {
    if (!mounted || !s) return null
    const todayStr = localISODate()
    const inPlan = s.segments
      .filter((x) => x.include !== false)
      .slice()
      .sort((a, b) => +new Date(a.arrive) - +new Date(b.arrive))
    const curIdx = inPlan.findIndex(
      (seg) => seg.arrive && seg.depart && seg.arrive <= todayStr && todayStr < seg.depart,
    )
    const current = curIdx >= 0 ? inPlan[curIdx] : null
    const next = current
      ? inPlan[curIdx + 1] ?? null
      : inPlan.find((seg) => seg.arrive > todayStr) ?? null
    const previous = current
      ? null
      : [...inPlan].reverse().find((seg) => seg.depart <= todayStr) ?? null
    const start = s.meta.startDate
    const end = s.meta.endDate
    const phase: 'pre' | 'live' | 'post' =
      start && todayStr < start ? 'pre' : end && todayStr > end ? 'post' : 'live'
    return {
      todayStr,
      inPlan,
      curIdx,
      current,
      next,
      previous,
      phase,
      dayNum: nightsBetween(start, todayStr) + 1, // Day 1 = departure day (FIXTURES.md)
      totalDays: end ? nightsBetween(start, end) + 1 : null,
      daysToGo: nightsBetween(todayStr, start),
    }
  }, [mounted, s])

  if (!mounted || trip.isPending)
    return <main className="mx-auto max-w-xl p-6 text-base text-tx2">Loading…</main>
  if (!trip.data || !s || !derived) return <CreateTripEmptyState />

  const { todayStr, inPlan, curIdx, current, next, previous, phase, dayNum, totalDays, daysToGo } = derived

  // City scope for the check-in place list: the current stop; in a gap you're
  // most likely still around the previous stop, else early at the next one.
  const checkinCity = current?.city ?? previous?.city ?? next?.city ?? null

  // Recency chips for the check-in sheet: distinct recent check-in place
  // names, newest first (the sheet caps them at 2 after exclusions).
  const recentPlaces = Array.from(
    new Set(
      (events.data ?? [])
        .filter((e) => e.kind === 'checkin')
        .map((e) => e.payload.placeName)
        .filter((x): x is string => typeof x === 'string' && x.trim() !== ''),
    ),
  ).slice(0, 6)

  // Plan-vs-actual: latest 'arrived' event vs the planned current stop.
  const lastArrivedCity = (events.data ?? []).find((e) => e.kind === 'arrived')?.payload?.city as
    | string
    | undefined
  const offPlan =
    phase === 'live' &&
    !!current &&
    !!lastArrivedCity &&
    lastArrivedCity.toLowerCase() !== current.city.toLowerCase()

  const doArrived = () => {
    const city = current?.city ?? next?.city ?? previous?.city ?? ''
    if (!city || !tripId) return
    if (!confirm(`Mark "Arrived in ${city}"?`)) return
    addEvent.mutate({ id: crypto.randomUUID(), tripId, kind: 'arrived', payload: { city } })
  }
  const saveNote = () => {
    const text = noteText.trim()
    if (!text || !tripId) return
    addEvent.mutate({ id: crypto.randomUUID(), tripId, kind: 'note', payload: { text } })
    setNoteText('')
    setNoteOpen(false)
  }
  const saveCheckIn = async (v: CheckInInput) => {
    if (!tripId) return
    const id = crypto.randomUUID()
    const { files, ...rest } = v
    // Photos upload BEFORE the (outbox-able) insert: paths are plain strings
    // that survive IndexedDB; blobs would not. Offline → skip photos, the
    // check-in itself still queues.
    let photos: string[] | undefined
    if (files.length && onlineManager.isOnline()) {
      setUploadingPhotos(true)
      try {
        photos = await uploadCheckinPhotos(sb, tripId, id, files)
      } catch (e) {
        // The USER decides what happens to a failed upload (owner decision
        // 2026-07-24): post without photos, or go back and adjust — never
        // post behind their back. The modal stays open on cancel.
        const detail = (e as Error)?.message ?? String(e)
        const postAnyway = confirm(
          `The photos couldn't be uploaded (${detail}).\n\nOK = post the check-in WITHOUT photos.\nCancel = go back to the check-in to adjust.`,
        )
        if (!postAnyway) return
        photos = undefined
      } finally {
        setUploadingPhotos(false)
      }
    }
    addCheckIn.mutate({ ...rest, id, tripId, photos })
    setCheckinOpen(false)
  }

  const mutErr = addCheckIn.isError
    ? addCheckIn.error
    : addEvent.isError
      ? addEvent.error
      : delEvent.error

  return (
    // Live is phone-first: desktop is the same centered narrow column (mock).
    <main className="mx-auto max-w-xl px-[18px] pb-6 pt-[18px]">
      {/* date row */}
      <div className="mb-4">
        <div className="text-base font-medium uppercase tracking-[.14em] text-ac2-deep">
          {fmtDayKicker(new Date())}
        </div>
        <h1 className="mt-1 font-serif text-[28px] font-semibold leading-[1.12] tracking-[-.01em]">
          {phase === 'pre' && s.meta.tripName}
          {phase === 'post' && `${s.meta.tripName} — trip complete`}
          {phase === 'live' && (
            <>
              Day {dayNum}
              {totalDays ? <span className="font-normal text-tx3"> of {totalDays}</span> : null}
              {' · '}
              {current ? current.city : previous ? 'between stops' : next ? 'on the way' : 'on the road'}
            </>
          )}
        </h1>
      </div>

      {!online && (
        <div className="lv-enter mb-3 flex items-start gap-2.5 rounded-[var(--r)] border-[1.5px] border-warn-line bg-sf p-3.5">
          <SatelliteDish aria-hidden className="mt-0.5 size-4 flex-none text-warn" strokeWidth={2} />
          <p className="flex-1 text-base font-medium leading-normal text-warn">
            You&apos;re offline - check-ins are saved on this phone and will sync when you&apos;re back.
          </p>
        </div>
      )}
      <SaveError show={addCheckIn.isError || addEvent.isError || delEvent.isError} error={mutErr} />

      {phase === 'pre' ? (
        <PreTrip s={s} daysToGo={daysToGo} firstStop={inPlan[0] ?? null} />
      ) : (
        <>
          {/* current stop hero / gap card */}
          {current ? (
            <CurrentStopCard
              seg={current}
              idx={curIdx}
              count={inPlan.length}
              next={next}
              stays={s.stays}
              todayStr={todayStr}
            />
          ) : (
            <div className={card + ' p-5'}>
              <div className="text-base font-semibold uppercase tracking-[.11em] text-tx2">
                {phase === 'post' ? 'Home again' : 'Between stops'}
              </div>
              <div className="mt-2 font-serif text-[22px] font-semibold leading-[1.3]">
                {phase === 'post'
                  ? 'The trip is over - the feed below keeps the memories.'
                  : previous && next
                    ? `${previous.city} → ${next.city}`
                    : next
                      ? `Next up: ${next.city}`
                      : 'No planned stop today'}
              </div>
              {phase !== 'post' && next && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-base text-tx2">
                  {next.city}, {next.country} from {fmtShort(next.arrive)}
                  {bookedStay(s.stays, next.id) ? (
                    <span className={pill + ' border-ac-line text-ac'}>booked</span>
                  ) : (
                    <span className={pill + ' border-warn-line text-warn'}>planned · not booked</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* big check-in CTA + quick actions */}
          {phase === 'live' && (
            <div className="mt-3">
              <button
                onClick={() => setCheckinOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-[var(--r)] bg-ac py-[17px] text-lg font-semibold text-on"
              >
                <MapPin aria-hidden className="size-5" strokeWidth={2} /> Check in - where are you?
              </button>
              <div className="mt-1.5 text-center text-base text-tx3">
                One tap · rating and comment optional
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2.5">
                <button
                  onClick={doArrived}
                  className="flex items-center justify-center gap-2 rounded-[var(--rCtl)] border-[1.5px] border-ln2 bg-sf py-3 text-base font-medium"
                >
                  <PlaneLanding aria-hidden className="size-[18px] flex-none" strokeWidth={2} />
                  <span className="truncate">
                    Arrived{current ? ` in ${current.city}` : next ? ` in ${next.city}` : ''}
                  </span>
                </button>
                <button
                  onClick={() => setNoteOpen(true)}
                  className="flex items-center justify-center gap-2 rounded-[var(--rCtl)] border-[1.5px] border-ln2 bg-sf py-3 text-base font-medium"
                >
                  <NotebookPen aria-hidden className="size-[18px] flex-none" strokeWidth={2} /> Note
                </button>
              </div>
            </div>
          )}

          {/* plan vs actual mini timeline */}
          {inPlan.length > 0 && (
            <div className={card + ' mt-3 p-4'}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-semibold uppercase tracking-[.11em] text-tx2">Plan vs actual</span>
                {offPlan ? (
                  <span className={pill + ' border-warn-line text-warn'}>off plan · last arrived {lastArrivedCity}</span>
                ) : (
                  <span className={pill + ' border-ac-line text-ac'}>on plan</span>
                )}
              </div>
              <div className="mt-2.5 flex gap-1">
                {inPlan.map((seg) => {
                  const n = Math.max(segNights(seg), 1)
                  const done = seg.depart <= todayStr
                  const cur = seg === current
                  const booked = !!bookedStay(s.stays, seg.id)
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
          )}
        </>
      )}

      {/* today's feed */}
      <div className="mb-2 mt-6 flex items-baseline justify-between">
        <h2 className="font-sans text-base font-semibold uppercase tracking-[.12em] text-tx2">Recent activity</h2>
        {events.data && events.data.length > 0 && (
          <span className="text-base text-tx3">{events.data.length} events</span>
        )}
      </div>
      <div className={card + ' overflow-hidden'}>
        {events.isPending && <div className="px-3.5 py-4 text-base text-tx2">Loading…</div>}
        {events.isError && (
          <div className="px-3.5 py-4 text-base text-warn">Couldn&apos;t load the feed - reload to retry.</div>
        )}
        {events.data && events.data.length === 0 && (
          <div className="px-3.5 py-6 text-center text-base text-tx2">
            {phase === 'pre'
              ? 'Nothing yet — the feed wakes up with the trip.'
              : 'No check-ins yet — tap “Check in” when you get somewhere.'}
          </div>
        )}
        {(events.data ?? []).map((ev) => (
          <EventRow
            key={ev.id}
            ev={ev}
            mine={!!uid && ev.author === uid}
            queued={pausedIds.has(ev.id)}
            onEdit={() => setEditEvent(ev)}
            onDelete={() => {
              if (confirm('Delete this entry? This is the undo — the row is removed for everyone.'))
                delEvent.mutate(ev.id)
            }}
          />
        ))}
      </div>

      {editEvent && tripId && (
        <EditEventModal ev={editEvent} tripId={tripId} onClose={() => setEditEvent(null)} />
      )}

      {checkinOpen && (
        <CheckInModal
          cityName={checkinCity}
          cities={cities.data ?? []}
          recent={recentPlaces}
          online={online}
          saving={uploadingPhotos || addCheckIn.isPending}
          onClose={() => setCheckinOpen(false)}
          onSave={saveCheckIn}
        />
      )}

      {noteOpen && (
        <Modal title="Add a note" onClose={() => setNoteOpen(false)}>
          <textarea
            rows={3}
            autoFocus
            className="w-full rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 py-3 text-base outline-none transition-colors focus:border-ac"
            placeholder="What happened?"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <div className="mt-3 flex gap-2.5">
            <button
              onClick={saveNote}
              disabled={!noteText.trim()}
              className="flex-1 rounded-[calc(var(--r)-2px)] bg-ac py-3 text-base font-semibold text-on disabled:opacity-50"
            >
              Save note
            </button>
            <button
              onClick={() => setNoteOpen(false)}
              className="rounded-[calc(var(--r)-2px)] border-[1.5px] border-ln3 px-4 py-3 text-base font-medium text-tx2"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </main>
  )
}

// useSyncExternalStore helpers — module-level so their identities are stable
// (DashboardClient pattern).
const subscribeNever = () => () => {}
const snapTrue = () => true
const snapFalse = () => false

// ---- pieces -----------------------------------------------------------------

function CurrentStopCard({
  seg,
  idx,
  count,
  next,
  stays,
  todayStr,
}: {
  seg: Segment
  idx: number
  count: number
  next: Segment | null
  stays: Stay[]
  todayStr: string
}) {
  const n = Math.max(segNights(seg), 1)
  const night = Math.min(nightsBetween(seg.arrive, todayStr) + 1, n)
  const left = n - night
  const stay = bookedStay(stays, seg.id)
  const nextBooked = next ? bookedStay(stays, next.id) : undefined
  return (
    <div className={card + ' lv-enter p-5'}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span aria-hidden className="h-2 w-2 rounded-full bg-ac" />
          <span className="text-base font-semibold uppercase tracking-[.11em] text-ac">Current stop</span>
        </span>
        <span className="text-base font-medium text-tx2">{idx + 1} of {count}</span>
      </div>
      <div className="mt-2 font-serif text-[26px] font-semibold leading-[1.2] tracking-[-.01em]">
        {seg.city}, night {night}
      </div>
      <div className="mt-1 text-base text-tx2">
        {stay ? `${stay.name} · booked` : `${seg.country} · not booked`} · leave {fmtShort(seg.depart)}
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-track">
        <span className="block h-full rounded-full bg-ac" style={{ width: Math.round((night / n) * 100) + '%' }} />
      </div>
      <div className="mt-1.5 flex items-baseline justify-between text-base">
        <span className="text-tx2">Night {night} of {n}</span>
        <span className="font-semibold text-ac2">{left} nights left</span>
      </div>
      {next && (
        <div className="mt-3 flex items-center justify-between gap-2.5 border-t border-ln pt-3">
          <span className="min-w-0">
            <span className="block text-base font-semibold">
              Next: {next.city} · {fmtShort(next.arrive)}
            </span>
            {!nextBooked && <span className="block text-base text-warn">no stay yet</span>}
          </span>
          {nextBooked && <span className={pill + ' flex-none border-ac-line text-ac'}>booked</span>}
        </div>
      )}
    </div>
  )
}

function PreTrip({
  s,
  daysToGo,
  firstStop,
}: {
  s: TripState
  daysToGo: number
  firstStop: Segment | null
}) {
  const upcomingDeadlines = s.stays
    .filter((st) => st.include !== false && (st.cancelUntil || st.chargeDate))
    .sort((a, b) => +new Date(a.cancelUntil ?? a.chargeDate ?? 0) - +new Date(b.cancelUntil ?? b.chargeDate ?? 0))
    .slice(0, 4)
  return (
    <div className="space-y-3">
      <div className={card + ' lv-enter p-6 text-center'}>
        <div className="text-base font-medium uppercase tracking-[.11em] text-tx2">Departure in</div>
        <div className="mt-1">
          <span className="text-[46px] font-semibold leading-none tracking-[-.03em] text-ac2">{daysToGo}</span>{' '}
          <span className="text-lg font-medium text-tx2">days</span>
        </div>
        <div className="mt-2 text-base text-tx2">
          {s.meta.homeBase ? s.meta.homeBase.split(',')[0] : 'Home'}
          {firstStop ? ` → ${firstStop.city}` : ''} · {s.meta.startDate}
        </div>
      </div>
      <div className={card + ' p-5'}>
        <div className="text-base font-semibold">Live mode starts with your trip</div>
        <div className="mt-1 text-base text-tx2">
          On {s.meta.startDate} this screen wakes up and becomes your daily home:
        </div>
        <div className="mt-2 grid gap-1.5 text-base text-tx2">
          <div>One-tap check-ins with ratings &amp; comments</div>
          <div>Current stop, nights left, what&apos;s next</div>
          <div>Plan vs actual — are we still on the route we drew?</div>
          <div>Arrival events that update the follower map</div>
        </div>
      </div>
      {upcomingDeadlines.length > 0 && (
        <div className={card + ' px-4'}>
          <div className="pt-3.5 text-base font-semibold uppercase tracking-[.11em] text-tx2">Before you fly</div>
          {upcomingDeadlines.map((st, i) => (
            <div
              key={st.id}
              className={
                'flex items-center justify-between gap-3 py-3 ' +
                (i < upcomingDeadlines.length - 1 ? 'border-b border-ln' : '')
              }
            >
              <div className="min-w-0">
                <div className="truncate text-base font-semibold">{st.name}</div>
                <div className="text-base text-tx2">
                  {st.cancelUntil ? `free cancel until ${st.cancelUntil}` : ''}
                  {st.cancelUntil && st.chargeDate ? ' · ' : ''}
                  {st.chargeDate ? `card charged ${st.chargeDate}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EventRow({ ev, mine, queued, onEdit, onDelete }: { ev: TripEvent; mine: boolean; queued?: boolean; onEdit: () => void; onDelete: () => void }) {
  const placeName = typeof ev.payload.placeName === 'string' ? ev.payload.placeName : null
  const noteText = typeof ev.payload.text === 'string' ? ev.payload.text : null
  const city = typeof ev.payload.city === 'string' ? ev.payload.city : null
  const rating = ev.check_in?.rating ?? null
  const comment = ev.check_in?.comment ?? null
  const title =
    ev.kind === 'checkin'
      ? placeName ?? 'Check-in'
      : ev.kind === 'arrived'
        ? `Arrived${city ? ` in ${city}` : ''}`
        : ev.kind === 'note'
          ? 'Note'
          : ev.kind === 'media'
            ? 'Media'
            : 'Location'
  const Icon = EVENT_ICON[ev.kind] ?? MapPin
  // "Only your words change": arrived/media/location rows carry nothing but
  // place + time, so there is nothing left to edit — Delete stays available.
  const editable = mine && (ev.kind === 'checkin' || ev.kind === 'note')
  return (
    <div className="flex gap-[11px] border-b border-ln px-3.5 py-[13px] last:border-b-0">
      <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[calc(var(--r)-2px)] bg-tag text-tag-ink">
        <Icon aria-hidden className="size-5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-[7px] gap-y-1">
          <span className="text-base font-semibold">{title}</span>
          {queued && (
            <span className="inline-flex items-center gap-1 rounded-full border-[1.4px] border-warn-line px-2.5 py-0.5 text-base font-semibold text-warn">
              <Hourglass aria-hidden className="size-3.5" strokeWidth={2} /> queued - will sync
            </span>
          )}
          {ev.visibility !== 'trip' && (
            <span className="rounded-full border-[1.4px] border-ac-line px-2.5 py-0.5 text-base font-medium text-ac">
              {ev.visibility}
            </span>
          )}
        </div>
        {rating != null && (
          <div className="text-base tracking-[.1em] text-warn">
            {'★'.repeat(rating)}
            <span className="text-ln3">{'★'.repeat(5 - rating)}</span>
          </div>
        )}
        {(comment || noteText) && (
          <div className="mt-0.5 text-base leading-snug text-tx2">&ldquo;{comment ?? noteText}&rdquo;</div>
        )}
        {Array.isArray(ev.payload.photos) && ev.payload.photos.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {(ev.payload.photos as string[]).map((p) => (
              <a key={p} href={publicMediaUrl(p)} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={publicMediaUrl(p)} alt="" loading="lazy" className="h-20 w-20 rounded-[14px] object-cover" />
              </a>
            ))}
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-base text-tx2">
          <span>
            {fmtEventTime(ev.occurred_at)}
            {mine ? ' · you' : ''}
            {ev.edited_at ? ' · edited' : ''}
          </span>
          {editable && (
            <button onClick={onEdit} className="font-semibold text-ac2">
              Edit
            </button>
          )}
          {mine && (
            <button onClick={onDelete} className="font-semibold text-ac2">
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
