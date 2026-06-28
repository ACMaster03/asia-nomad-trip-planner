'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 5 * 60_000 } }, // avoid instant refetch after hydration
      }),
  )
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}
