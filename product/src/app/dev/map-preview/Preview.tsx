'use client'
import { Suspense } from 'react'
import { TripScopeProvider } from '@/lib/trips/TripScope'
import { MoneyProvider } from '@/lib/trips/Money'
import MapClient from '@/app/(app)/map/MapClient'
import KnowledgeClient from '@/app/(app)/knowledge/KnowledgeClient'
import DashboardClient from '@/app/(app)/dashboard/DashboardClient'
import { ToastProvider } from '@/components/Toast'

// The (app) layout's providers, minus auth (see money-preview/Preview.tsx).
export type Screen = 'map' | 'knowledge' | 'home'
export default function Preview({ screen }: { screen: Screen }) {
  return (
    <TripScopeProvider initialTripId="fixture" initialRole="owner">
      <MoneyProvider initialBase="HUF">
        {screen === 'map' && <MapClient />}
        {screen === 'knowledge' && (
          <Suspense fallback={null}>
            <KnowledgeClient />
          </Suspense>
        )}
        {screen === 'home' && (
          <ToastProvider>
            <div className="pb-20"><DashboardClient userEmail="dev@example.com" userName="Patrik" userId="me" /></div>
          </ToastProvider>
        )}
      </MoneyProvider>
    </TripScopeProvider>
  )
}
