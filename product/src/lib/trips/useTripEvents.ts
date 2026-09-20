'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  onlineManager,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useTripScope } from '@/lib/trips/TripScope'
import { tk } from '@/lib/trips/keys'
import { deleteTripEvent, fetchTripEvents, type TripEvent } from '@/lib/trips/events'
import {
  CHECKIN_MUTATION_KEY,
  EVENT_MUTATION_KEY,
  type CheckInVars,
  type EventVars,
} from '@/lib/trips/outbox'
import { uploadCheckinPhotos } from '@/lib/trips/media'
import { useToast } from '@/components/Toast'
import { maybeNudge } from '@/app/(app)/live/FollowerNudge'
import type { CheckInInput } from '@/app/(app)/live/CheckInModal'

// The trip's event feed and everything that writes to it, lifted out of
// LiveClient unchanged.
//
// WHY IT MOVED: /live is Home a second time, and collapsing the two means the
// check-in sheet has to open from the layout, over whatever screen the
// traveller is on. The sheet cannot come along while its mutations live inside
// the screen it is trying to leave.
//
// WHAT MUST NOT CHANGE: the mutation KEYS. Inserts carry no local mutationFn —
// lib/trips/outbox.ts registers the defaults against CHECKIN_MUTATION_KEY and
// EVENT_MUTATION_KEY, which is what lets an offline check-in pause, persist to
// IndexedDB and replay after a reload. A check-in queued on a phone before this
// shipped is keyed by those constants; rename them and it replays into nothing.
// They are imported, never retyped.

export function useTripEvents() {
  const sb = createClient()
  const qc = useQueryClient()
  const toast = useToast()
  const { tripId } = useTripScope()

  // Author of the optimistic row. Read once: the id cannot change without a
  // new session, which remounts everything under the (app) layout anyway.
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
  const settle = () => qc.invalidateQueries({ queryKey: eventsKey }) // delete only; inserts settle via outbox defaults
  const stamp = () => new Date().toISOString()

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

  // Offline awareness: TanStack's onlineManager is the same signal that pauses
  // the outbox mutations, so banner and behaviour cannot disagree.
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
          m.state.isPaused && ['outbox'].includes((m.options.mutationKey?.[0] as string) ?? ''),
      },
      select: (m) => (m.state.variables as { id?: string })?.id ?? '',
    }),
  )

  // Recency chips for the check-in sheet: distinct recent check-in place names,
  // newest first (the sheet caps them at 2 after exclusions).
  const recentPlaces = Array.from(
    new Set(
      (events.data ?? [])
        .filter((e) => e.kind === 'checkin')
        .map((e) => e.payload.placeName)
        .filter((x): x is string => typeof x === 'string' && x.trim() !== ''),
    ),
  ).slice(0, 6)

  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [nudge, setNudge] = useState(false)

  /**
   * Post a check-in. Resolves true when something was written, false when the
   * traveller backed out of a failed photo upload and the sheet should stay up.
   */
  const saveCheckIn = async (v: CheckInInput): Promise<boolean> => {
    if (!tripId) return false
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
        // 2026-07-24): post without photos, or go back and adjust — never post
        // behind their back. The sheet stays open on cancel.
        const detail = (e as Error)?.message ?? String(e)
        const postAnyway = confirm(
          `The photos couldn't be uploaded (${detail}).\n\nOK = post the check-in WITHOUT photos.\nCancel = go back to the check-in to adjust.`,
        )
        if (!postAnyway) return false
        photos = undefined
      } finally {
        setUploadingPhotos(false)
      }
    }
    const firstCheckIn = !(events.data ?? []).some((e) => e.kind === 'checkin')
    addCheckIn.mutate({ ...rest, id, tripId, photos })
    if (firstCheckIn && rest.visibility !== 'trip' && onlineManager.isOnline()) {
      void maybeNudge(sb, tripId).then(setNudge)
    }
    toast(
      onlineManager.isOnline()
        ? rest.visibility === 'trip'
          ? 'Check-in posted - just for the two of you'
          : 'Check-in posted · followers notified'
        : 'Queued on this phone - syncs when you reconnect',
    )
    return true
  }

  /** Rig behavior (frame 08): tap → recorded → toast. No blocking confirm. */
  const recordArrived = (city: string) => {
    if (!city || !tripId) return
    addEvent.mutate({ id: crypto.randomUUID(), tripId, kind: 'arrived', payload: { city } })
    toast('Arrival recorded - the button is done for this stop')
  }

  /** Resolves false when there was nothing to write, so the modal stays open. */
  const saveNote = (text: string): boolean => {
    const body = text.trim()
    if (!body || !tripId) return false
    addEvent.mutate({ id: crypto.randomUUID(), tripId, kind: 'note', payload: { text: body } })
    return true
  }

  const mutError = addCheckIn.isError
    ? addCheckIn.error
    : addEvent.isError
      ? addEvent.error
      : delEvent.error

  return {
    tripId,
    uid,
    events,
    online,
    pausedIds,
    recentPlaces,
    uploadingPhotos,
    nudge,
    setNudge,
    saveCheckIn,
    recordArrived,
    saveNote,
    delEvent,
    saving: uploadingPhotos || addCheckIn.isPending,
    hasError: addCheckIn.isError || addEvent.isError || delEvent.isError,
    mutError,
  }
}
