'use client'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  onlineManager,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
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
import type { Segment, Stay, TripState } from '@/lib/trips/types'

const EVENT_ICON: Record<TripEventKind, string> = {
  checkin: '📍',
  note: '📝',
  arrived: '🛬',
  media: '🖼️',
  location: '📡',
}

// Local (device-timezone) YYYY-MM-DD — comparable to the segment date strings.
function localISODate(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const fmtDayKicker = (d: Date) =>
  d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })

const fmtEventTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

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
  const [mounted, setMounted] = useState(false)
  const [uid, setUid] = useState<string | null>(null)
  useEffect(() => {
    setMounted(true)
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
  // the outbox mutations — subscribing to it keeps banner and behavior in sync.
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
    return <main className="mx-auto max-w-xl p-6">Loading…</main>
  if (!trip.data || !s || !derived) return <CreateTripEmptyState />

  const { todayStr, inPlan, curIdx, current, next, previous, phase, dayNum, totalDays, daysToGo } = derived

  // City scope for the check-in place list: the current stop; in a gap you're
  // most likely still around the previous stop, else early at the next one.
  const checkinCity = current?.city ?? previous?.city ?? next?.city ?? null

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
    let photoError: string | null = null
    if (files.length && onlineManager.isOnline()) {
      try {
        photos = await uploadCheckinPhotos(sb, tripId, id, files)
      } catch (e) {
        photos = undefined // photo failure never blocks the check-in…
        // …but it must never be silent OR vague — surface the stage-tagged
        // message so a field report pinpoints the cause (dogfood 2026-07-24).
        photoError = (e as Error)?.message ?? String(e)
      }
    }
    addCheckIn.mutate({ ...rest, id, tripId, photos })
    setCheckinOpen(false)
    if (photoError) {
      alert(`Check-in posted — but the photos didn't make it.\n\nDetail: ${photoError}`)
    }
  }

  const mutErr = addCheckIn.isError
    ? addCheckIn.error
    : addEvent.isError
      ? addEvent.error
      : delEvent.error

  return (
    // Live is phone-first: desktop is the same centered narrow column (mock).
    <main className="mx-auto max-w-xl p-4 sm:p-6">
      {/* date row */}
      <div className="mb-4">
        <div className="text-xs uppercase tracking-wide text-neutral-500">
          {fmtDayKicker(new Date())}
        </div>
        <h1 className="text-xl font-semibold">
          {phase === 'pre' && s.meta.tripName}
          {phase === 'post' && `${s.meta.tripName} — trip complete`}
          {phase === 'live' && (
            <>
              Day {dayNum}
              {totalDays ? <span className="font-normal text-neutral-500"> of {totalDays}</span> : null}
              {' · '}
              {current ? current.city : previous ? 'between stops' : next ? 'on the way' : 'on the road'}
            </>
          )}
        </h1>
      </div>

      {!online && (
        <div className="mb-3 rounded-lg border border-amber-600/60 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          📡 You&apos;re offline — check-ins are saved on this phone and will sync when you&apos;re back.
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
            <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                {phase === 'post' ? 'Home again' : 'Between stops'}
              </div>
              <div className="mt-1 text-base font-semibold">
                {phase === 'post'
                  ? '🎉 The trip is over — the feed below keeps the memories.'
                  : previous && next
                    ? `✈️ ${previous.city} → ${next.city}`
                    : next
                      ? `✈️ Next up: ${next.city}`
                      : '📍 No planned stop today'}
              </div>
              {phase !== 'post' && next && (
                <div className="mt-1 text-sm text-neutral-500">
                  {next.city}, {next.country} from {next.arrive}
                  {bookedStay(s.stays, next.id) ? (
                    <span className="ml-2 rounded-full border border-emerald-600 px-2 py-0.5 text-xs font-semibold text-emerald-600">booked</span>
                  ) : (
                    <span className="ml-2 rounded-full border border-amber-600 px-2 py-0.5 text-xs font-semibold text-amber-600">planned · not booked</span>
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
                className="w-full rounded-xl bg-teal-600 px-4 py-3 text-base font-semibold text-white hover:bg-teal-700"
              >
                📍 Check in — where are you?
              </button>
              <div className="mt-1 text-center text-xs text-neutral-500">
                One tap · rating and comment optional
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  onClick={doArrived}
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
                >
                  🛬 Arrived{current ? ` in ${current.city}` : next ? ` in ${next.city}` : ''}
                </button>
                <button
                  onClick={() => setNoteOpen(true)}
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
                >
                  📝 Note
                </button>
              </div>
            </div>
          )}

          {/* plan vs actual mini timeline */}
          {inPlan.length > 0 && (
            <div className="mt-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-neutral-500">Plan vs actual</span>
                {offPlan ? (
                  <span className="rounded-full border border-amber-600 px-2 py-0.5 text-xs font-semibold text-amber-600">off plan · last arrived {lastArrivedCity}</span>
                ) : (
                  <span className="rounded-full border border-emerald-600 px-2 py-0.5 text-xs font-semibold text-emerald-600">on plan</span>
                )}
              </div>
              <div className="mt-2 flex gap-1">
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
                      <div className="mb-1 truncate text-center text-[9px] uppercase tracking-wide text-neutral-500">
                        {seg.city.slice(0, 3)}
                      </div>
                      {done ? (
                        <div className="h-2 rounded bg-teal-600" />
                      ) : cur ? (
                        <div className="relative h-2 rounded border border-teal-600 bg-neutral-100 dark:bg-neutral-900">
                          <span
                            className="absolute inset-y-0 left-0 rounded-l bg-teal-600"
                            style={{ width: pct + '%' }}
                          />
                          <span
                            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-teal-600 dark:border-neutral-950"
                            style={{ left: pct + '%' }}
                          />
                        </div>
                      ) : (
                        <div
                          className={
                            'h-2 rounded border bg-neutral-100 dark:bg-neutral-900 ' +
                            (booked
                              ? 'border-neutral-400 dark:border-neutral-600'
                              : 'border-dashed border-neutral-300 dark:border-neutral-700')
                          }
                        />
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="mt-2 text-[11px] text-neutral-500">
                ● you are here · solid = booked · dashed = planned, unbooked · widths ∝ stop length
              </div>
            </div>
          )}
        </>
      )}

      {/* today's feed */}
      <div className="mt-6 mb-2 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Recent activity</h2>
        {events.data && events.data.length > 0 && (
          <span className="text-xs text-neutral-500">{events.data.length} events</span>
        )}
      </div>
      <div className="rounded-lg border border-neutral-200 px-3 dark:border-neutral-800">
        {events.isPending && <div className="py-4 text-sm text-neutral-500">Loading…</div>}
        {events.isError && (
          <div className="py-4 text-sm text-red-600">Couldn&apos;t load the feed — reload to retry.</div>
        )}
        {events.data && events.data.length === 0 && (
          <div className="py-6 text-center text-sm text-neutral-500">
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
            onDelete={() => {
              if (confirm('Delete this entry? This is the undo — the row is removed for everyone.'))
                delEvent.mutate(ev.id)
            }}
          />
        ))}
      </div>

      {checkinOpen && (
        <CheckInModal
          cityName={checkinCity}
          cities={cities.data ?? []}
          saving={addCheckIn.isPending}
          onClose={() => setCheckinOpen(false)}
          onSave={saveCheckIn}
        />
      )}

      {noteOpen && (
        <Modal title="📝 Add a note" onClose={() => setNoteOpen(false)}>
          <textarea
            rows={3}
            autoFocus
            className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            placeholder="What happened?"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={saveNote}
              disabled={!noteText.trim()}
              className="rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Save note
            </button>
            <button
              onClick={() => setNoteOpen(false)}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </main>
  )
}

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
    <div className="rounded-xl border border-teal-600/70 bg-gradient-to-b from-teal-50 to-transparent p-4 dark:from-teal-950/30">
      <div className="text-xs uppercase tracking-wide text-neutral-500">
        Current stop · {idx + 1} of {count}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="text-base font-semibold">
          🏙️ {stay ? `${stay.name} · ${seg.city}` : `${seg.city}, ${seg.country}`}
        </div>
        {stay ? (
          <span className="rounded-full border border-emerald-600 px-2 py-0.5 text-xs font-semibold text-emerald-600">booked</span>
        ) : (
          <span className="rounded-full border border-amber-600 px-2 py-0.5 text-xs font-semibold text-amber-600">not booked</span>
        )}
      </div>
      <div className="mt-0.5 mb-2 text-sm text-neutral-500">
        {seg.arrive} → {seg.depart} · {n} nights
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <span className="block h-full bg-teal-600" style={{ width: Math.round((night / n) * 100) + '%' }} />
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-sm">
        <span>
          Night <b>{night}</b> of {n}
        </span>
        <span className="text-neutral-400">·</span>
        <span className="font-semibold text-teal-700 dark:text-teal-400">{left} nights left</span>
      </div>
      {next && (
        <>
          <hr className="my-3 border-neutral-200 dark:border-neutral-800" />
          <div className="flex items-center gap-2 text-sm">
            <span className="text-neutral-500">Next:</span>
            <b>{next.city}</b>
            <span className="text-neutral-500">· from {next.arrive}</span>
            <span className="ml-auto">
              {nextBooked ? (
                <span className="rounded-full border border-emerald-600 px-2 py-0.5 text-xs font-semibold text-emerald-600">booked</span>
              ) : (
                <span className="rounded-full border border-amber-600 px-2 py-0.5 text-xs font-semibold text-amber-600">planned · not booked</span>
              )}
            </span>
          </div>
        </>
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
      <div className="rounded-xl border border-teal-600/70 bg-gradient-to-b from-teal-50 to-transparent p-6 text-center dark:from-teal-950/30">
        <div className="text-xs uppercase tracking-wide text-neutral-500">Departure in</div>
        <div className="text-5xl font-extrabold tracking-tight">
          {daysToGo} <span className="text-xl font-semibold">days</span>
        </div>
        <div className="mt-2 text-sm text-neutral-500">
          {s.meta.homeBase ? s.meta.homeBase.split(',')[0] : 'Home'}
          {firstStop ? ` → ${firstStop.city}` : ''} · {s.meta.startDate}
        </div>
      </div>
      <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="mb-1 text-base font-semibold">🌙 Live mode starts with your trip</div>
        <div className="text-sm text-neutral-500">
          On {s.meta.startDate} this screen wakes up and becomes your daily home:
        </div>
        <div className="mt-2 grid gap-1 text-sm">
          <div>📍 One-tap check-ins with ratings &amp; comments</div>
          <div>🏙️ Current stop, nights left, what&apos;s next</div>
          <div>📈 Plan vs actual — are we still on the route we drew?</div>
          <div>🛬 Arrival events that update the follower map (M3)</div>
        </div>
      </div>
      {upcomingDeadlines.length > 0 && (
        <div className="rounded-lg border border-neutral-200 px-3 dark:border-neutral-800">
          <div className="pt-3 text-xs uppercase tracking-wide text-neutral-500">Before you fly</div>
          {upcomingDeadlines.map((st) => (
            <div
              key={st.id}
              className="flex items-center justify-between gap-3 border-b border-neutral-200 py-2.5 text-sm last:border-b-0 dark:border-neutral-800"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{st.name}</div>
                <div className="text-xs text-neutral-500">
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

function EventRow({ ev, mine, queued, onDelete }: { ev: TripEvent; mine: boolean; queued?: boolean; onDelete: () => void }) {
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
  return (
    <div className="flex items-start gap-3 border-b border-neutral-200 py-3 last:border-b-0 dark:border-neutral-800">
      <div className="flex h-11 w-11 flex-none items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-xl dark:border-neutral-800 dark:bg-neutral-900">
        {EVENT_ICON[ev.kind] ?? '•'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{title}</span>
          {queued && (
            <span className="rounded-full border border-amber-600 px-2 py-0.5 text-[11px] font-semibold text-amber-600">
              ⏳ queued — will sync
            </span>
          )}
          {ev.visibility !== 'trip' && (
            <span className="rounded-full border border-teal-600 px-2 py-0.5 text-[11px] font-semibold text-teal-600">
              {ev.visibility}
            </span>
          )}
          {ev.kind !== 'checkin' && (
            <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-[11px] font-semibold text-neutral-500 dark:border-neutral-700">
              event
            </span>
          )}
        </div>
        {rating != null && (
          <div className="text-sm tracking-widest text-amber-500">
            {'★'.repeat(rating)}
            <span className="text-neutral-300 dark:text-neutral-700">{'★'.repeat(5 - rating)}</span>
          </div>
        )}
        {(comment || noteText) && <div className="mt-0.5 text-sm">&ldquo;{comment ?? noteText}&rdquo;</div>}
        {Array.isArray(ev.payload.photos) && ev.payload.photos.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {(ev.payload.photos as string[]).map((p) => (
              <a key={p} href={publicMediaUrl(p)} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={publicMediaUrl(p)} alt="" loading="lazy" className="h-20 w-20 rounded-lg object-cover" />
              </a>
            ))}
          </div>
        )}
        <div className="mt-0.5 text-xs text-neutral-500">
          {fmtEventTime(ev.occurred_at)}
          {mine ? ' · you' : ''}
        </div>
      </div>
      {mine && (
        <button onClick={onDelete} className="text-xs text-red-600 hover:underline">
          undo
        </button>
      )}
    </div>
  )
}
