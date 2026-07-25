'use client'
import { createContext, useContext, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchTrip } from './queries'
import { tk } from './keys'
import { useTripScope } from './TripScope'
import { fmtMoney } from './format'

// One place that knows what currency this trip counts in, so no component has
// to hardcode a symbol again.
//
// Before this, the old fmtHUF() appended a literal " Ft" everywhere while
// meta.baseCurrency was stored and editable — switching base relabelled every
// number without converting it.
//
// Seeded from the server layout (which already resolved the active trip) and
// then kept live from the trip query, so changing base in Settings updates
// every screen without a reload.

interface MoneyValue {
  base: string
  /** Format an amount that is ALREADY in the base currency. */
  fmt: (n: number) => string
}

const MoneyContext = createContext<MoneyValue | null>(null)

export function MoneyProvider({
  initialBase,
  children,
}: {
  initialBase: string
  children: React.ReactNode
}) {
  const sb = createClient()
  const { tripId } = useTripScope()
  const trip = useQuery({
    queryKey: tk.trip(tripId ?? 'none'),
    queryFn: () => (tripId ? fetchTrip(sb, tripId) : Promise.resolve(null)),
    enabled: tripId !== null,
  })

  const base = trip.data?.state?.meta?.baseCurrency || initialBase || 'HUF'
  const value = useMemo<MoneyValue>(
    () => ({ base, fmt: (n: number) => fmtMoney(n, base) }),
    [base],
  )
  return <MoneyContext.Provider value={value}>{children}</MoneyContext.Provider>
}

export function useMoney(): MoneyValue {
  const ctx = useContext(MoneyContext)
  // Components outside the (app) layout (or in tests) still format sensibly
  // rather than crashing — HUF matches the historical default.
  if (!ctx) return { base: 'HUF', fmt: (n: number) => fmtMoney(n, 'HUF') }
  return ctx
}
