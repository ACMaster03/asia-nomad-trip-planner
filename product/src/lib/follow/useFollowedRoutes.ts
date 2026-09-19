'use client'
import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { tk } from '@/lib/trips/keys'
import { fetchFollowedSummary, type FollowedPerson } from './follows'
import type { Summaries } from '@/lib/map/people'

// The itineraries behind the people you follow (issue #9): one
// followed_trip_summary per open trip, cached under the same key the journey
// page uses, so opening a journey and looking at the map share a fetch.
export function useFollowedRoutes(following: readonly FollowedPerson[] | undefined, enabled = true): Summaries {
  const sb = createClient()
  const tripIds = useMemo(
    () => [...new Set((following ?? []).flatMap((p) => p.trips.filter((t) => t.state === 'on').map((t) => t.trip_id)))].sort(),
    [following],
  )
  const results = useQueries({
    queries: tripIds.map((id) => ({
      queryKey: tk.followedSummary(id),
      queryFn: () => fetchFollowedSummary(sb, id),
      staleTime: 5 * 60_000,
      retry: false,
      enabled,
    })),
  })
  // useQueries hands back a new array every render; key the memo on what
  // actually changed so the map's layers are not rebuilt for nothing.
  const stamp = results.map((r) => r.dataUpdatedAt).join(',')
  return useMemo(
    () => Object.fromEntries(tripIds.map((id, i) => [id, results[i]?.data])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tripIds, stamp],
  )
}
