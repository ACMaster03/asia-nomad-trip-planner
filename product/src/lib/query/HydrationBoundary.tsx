'use client'
import { useMemo, useSyncExternalStore } from 'react'
import { useQueryClient, type DehydratedState } from '@tanstack/react-query'
import { applyDehydratedState } from './hydration'

// Drop-in for @tanstack/react-query's HydrationBoundary on the trip screens.
// The difference (and the reason it exists) is documented in ./hydration.ts:
// the server-dehydrated state is applied synchronously in render, and during
// document hydration it always wins over the persisted IndexedDB cache.

const subscribeToNothing = () => () => {}
const clientSnapshot = () => false
const serverSnapshot = () => true

export function HydrationBoundary({
  state,
  children,
}: {
  state: DehydratedState
  children: React.ReactNode
}) {
  const client = useQueryClient()
  // true on the server and while React hydrates its HTML on the client (React
  // reads the server snapshot then); false on client-side navigations and on
  // the one re-render React schedules after hydration when the two differ.
  const hydrating = useSyncExternalStore(subscribeToNothing, clientSnapshot, serverSnapshot)
  useMemo(() => applyDehydratedState(client, state, { hydrating }), [client, state, hydrating])
  return children
}
