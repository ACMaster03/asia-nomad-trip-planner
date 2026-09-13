'use client'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TripScopeProvider } from '@/lib/trips/TripScope'
import { MoneyProvider } from '@/lib/trips/Money'
import { tk } from '@/lib/trips/keys'
import MoneyPage from '@/components/money/MoneyPage'
import { fixtureTrip } from './fixture'

export default function Preview() {
  const [qc] = useState(() => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })
    client.setQueryData(tk.trip('fixture'), fixtureTrip(new Date().toISOString().slice(0, 10)))
    return client
  })
  return (
    <QueryClientProvider client={qc}>
      <TripScopeProvider initialTripId="fixture" initialRole="owner">
        <MoneyProvider initialBase="HUF">
          <div className="pb-20">
            <MoneyPage />
          </div>
        </MoneyProvider>
      </TripScopeProvider>
    </QueryClientProvider>
  )
}
