'use client'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchTripRole, canEditRole, canAdministerRole, type ResolvedRole } from './role'
import { tk } from './keys'
import { useTripScope } from './TripScope'

// The caller's role on the scoped trip, for gating edit affordances.
//
// Seeded from the server layout for the initially-selected trip (no flash), and
// re-validated on window focus so a co-editor whose access is revoked WHILE THE
// TAB IS OPEN gets the read-only UI on their next glance rather than at their
// next failed save. The failed save is still handled — see isPermissionDenied
// in queries.ts — this just makes the common case quiet.
//
// While unresolved (only after a trip switch, since the initial trip is seeded)
// the role is 'unknown': canEdit is false, but callers should not show the
// read-only banner either. Rendering "you are a viewer" at someone who turns
// out to be the owner is worse than a beat of missing buttons.
export function useTripRole() {
  const sb = createClient()
  const { tripId, initialTripId, initialRole } = useTripScope()
  const seeded = tripId !== null && tripId === initialTripId && initialRole !== null

  const q = useQuery({
    queryKey: tk.role(tripId ?? 'none'),
    queryFn: () => (tripId ? fetchTripRole(sb, tripId) : Promise.resolve('none' as const)),
    initialData: seeded ? initialRole : undefined,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  })

  const role: ResolvedRole = q.data ?? 'unknown'

  // FAIL OPEN when the lookup itself fails (offline, flaky hotel wifi) and we
  // have no cached answer — same call as the /live nav item in the (app)
  // layout, and for the same reason: on the road, an owner silently losing
  // every edit button to a network blip is a far worse failure than a viewer
  // seeing buttons whose writes the database refuses anyway. A pending first
  // load is NOT this case — that resolves in a moment and stays closed.
  const unresolvable = q.isError && q.data === undefined

  return {
    role,
    canEdit: canEditRole(role) || unresolvable,
    canAdminister: canAdministerRole(role),
    isViewer: role === 'viewer',
    // No relationship with this trip at all — it was deleted, or access was
    // revoked outright rather than downgraded.
    hasNoAccess: role === 'none',
    isResolved: role !== 'unknown',
  }
}
