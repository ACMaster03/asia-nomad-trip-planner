'use client'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { get, set, del } from 'idb-keyval'
import { useState } from 'react'
import { registerOutboxMutations } from '@/lib/trips/outbox'

// Cache + OUTBOX persistence (M2): the query cache and any PAUSED mutations
// (check-ins made offline) are persisted to IndexedDB. On reload/reconnect,
// PersistQueryClientProvider restores them and onSuccess replays the paused
// mutations through the defaults registered in lib/trips/outbox.ts.
// localStorage is too small for the catalogue + feed caches → IndexedDB.
const persister =
  typeof window !== 'undefined'
    ? createAsyncStoragePersister({
        storage: {
          getItem: (key: string) => get(key).then((v) => v ?? null),
          setItem: (key: string, value: string) => set(key, value),
          removeItem: (key: string) => del(key),
        },
        key: 'anp-query-cache',
        throttleTime: 2_000,
      })
    : undefined

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5 * 60_000, // avoid instant refetch after hydration
          refetchOnWindowFocus: false, // don't clobber in-progress edits on tab focus
          gcTime: 1000 * 60 * 60 * 24, // keep cached screens readable offline for a day
        },
      },
    })
    registerOutboxMutations(client)
    return client
  })

  if (!persister) {
    // SSR pass: no persistence on the server — plain provider semantics via
    // the persist provider with a no-op is not possible, but this branch never
    // renders client-side. Hydration happens per-page via HydrationBoundary.
    return (
      <PersistQueryClientProvider
        client={qc}
        persistOptions={{ persister: { persistClient: async () => {}, restoreClient: async () => undefined, removeClient: async () => {} } }}
      >
        {children}
      </PersistQueryClientProvider>
    )
  }

  return (
    <PersistQueryClientProvider
      client={qc}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24, // matches the outbox gcTime
        buster: 'anp-v1', // bump to invalidate persisted caches after breaking changes
      }}
      onSuccess={() => {
        // cache restored → replay anything the outbox queued while offline
        qc.resumePausedMutations()
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
