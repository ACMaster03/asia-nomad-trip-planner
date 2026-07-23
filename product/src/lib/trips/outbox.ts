'use client'
import type { QueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { insertCheckIn, insertTripEvent } from './events'
import { tk } from './keys'
import type { TripEventKind, TripEventVisibility } from './events'

// ============================================================================
// Offline outbox (M2 item 3) — persisted TanStack mutations.
//
// HOW IT WORKS: check-in / event inserts are defined here as MUTATION DEFAULTS
// keyed by mutationKey. Components call useMutation({ mutationKey }) WITHOUT a
// local mutationFn, so:
//   - offline (networkMode 'online', the default): the mutation PAUSES; its
//     variables persist to IndexedDB with the query-client cache.
//   - back online / app reopened: PersistQueryClientProvider restores the cache
//     and resumePausedMutations() replays each paused mutation through the
//     default fn below — which is why the fn must live HERE, not in a component
//     (a component's closure can't be rehydrated from IndexedDB).
//
// IDEMPOTENCY: every insert carries a client-generated uuid. A replay that
// races an already-delivered attempt hits the primary-key conflict → Postgres
// 23505 → we treat that as success ("it's already there").
//
// SCOPE: per the approved plan, check-ins/events are the ONLY offline writes.
// Plan editing offline is explicitly out of scope; deletes stay online-only.
// ============================================================================

export type CheckInVars = {
  id: string
  tripId: string
  placeId: string | null
  placeName: string
  rating: number | null
  comment: string
  visibility: TripEventVisibility
  // storage paths — photos upload BEFORE mutate (plain strings persist fine
  // in IndexedDB; blobs would not, which is why offline check-ins are photoless)
  photos?: string[]
}

export type EventVars = {
  id: string
  tripId: string
  kind: TripEventKind
  payload: Record<string, unknown>
  visibility?: TripEventVisibility
}

export const CHECKIN_MUTATION_KEY = ['outbox', 'checkin'] as const
export const EVENT_MUTATION_KEY = ['outbox', 'event'] as const

const isDuplicate = (e: unknown) =>
  typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505'

export function registerOutboxMutations(qc: QueryClient) {
  qc.setMutationDefaults(CHECKIN_MUTATION_KEY, {
    mutationFn: async (v: CheckInVars) => {
      const sb = createClient()
      try {
        await insertCheckIn(sb, { ...v, comment: v.comment })
      } catch (e) {
        if (!isDuplicate(e)) throw e // duplicate = already delivered = success
      }
    },
    // keep replayable mutations around long enough to survive a travel day
    gcTime: 1000 * 60 * 60 * 24,
    retry: 3,
    onSettled: (_d, _e, v) => qc.invalidateQueries({ queryKey: tk.events(v.tripId) }),
  })

  qc.setMutationDefaults(EVENT_MUTATION_KEY, {
    mutationFn: async (v: EventVars) => {
      const sb = createClient()
      try {
        await insertTripEvent(sb, v)
      } catch (e) {
        if (!isDuplicate(e)) throw e
      }
    },
    gcTime: 1000 * 60 * 60 * 24,
    retry: 3,
    onSettled: (_d, _e, v) => qc.invalidateQueries({ queryKey: tk.events(v.tripId) }),
  })
}
