'use client'
import { Suspense } from 'react'
import { TripScopeProvider } from '@/lib/trips/TripScope'
import { MoneyProvider } from '@/lib/trips/Money'
import MapClient from '@/app/(app)/map/MapClient'
import KnowledgeClient from '@/app/(app)/knowledge/KnowledgeClient'

// The (app) layout's providers, minus auth (see money-preview/Preview.tsx).
export default function Preview({ screen }: { screen: 'map' | 'knowledge' }) {
  return (
    <TripScopeProvider initialTripId="fixture" initialRole="owner">
      <MoneyProvider initialBase="HUF">
        {screen === 'map' ? (
          <MapClient />
        ) : (
          <Suspense fallback={null}>
            <KnowledgeClient />
          </Suspense>
        )}
      </MoneyProvider>
    </TripScopeProvider>
  )
}
