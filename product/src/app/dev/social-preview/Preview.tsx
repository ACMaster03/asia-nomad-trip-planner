'use client'
import { TripScopeProvider } from '@/lib/trips/TripScope'
import { MoneyProvider } from '@/lib/trips/Money'
import { ToastProvider } from '@/components/Toast'
import DashboardClient from '@/app/(app)/dashboard/DashboardClient'
import JourneyClient from '@/app/(app)/journeys/[trip]/JourneyClient'
import PeopleClient from '@/app/(app)/people/PeopleClient'
import PostView from '@/components/social/PostView'
import FollowClient from '@/app/follow/[token]/FollowClient'
import MoneyPage from '@/components/money/MoneyPage'
import { NotificationSettings } from '@/components/trips/NotificationSettings'
import { SharingCard } from '@/app/(app)/account/AccountClient'
import { JOURNEY_TRIP, ME, POST_ID, TOKEN, sharedSummary } from './fixture'

export type Screen = 'home' | 'nohome' | 'nobody' | 'notrip' | 'journey' | 'people' | 'post' | 'follow' | 'alerts' | 'sharing'

// The (app) layout's providers, minus auth (see money-preview/Preview.tsx).
export default function Preview({ screen, tab }: { screen: Screen; tab: 'following' | 'followers' }) {
  return (
    <TripScopeProvider initialTripId={screen === 'nohome' || screen === 'nobody' || screen === 'notrip' ? null : 'fixture'} initialRole="owner">
      <MoneyProvider initialBase="HUF">
        <ToastProvider>
          <div className="pb-20">
            {(screen === 'home' || screen === 'nohome' || screen === 'nobody') && <DashboardClient userEmail="dev@example.com" userName="Patrik" userId={ME} />}
            {screen === 'notrip' && <MoneyPage />}
            {screen === 'journey' && <JourneyClient tripId={JOURNEY_TRIP} />}
            {screen === 'people' && <PeopleClient initialTab={tab} />}
            {screen === 'post' && (
              <main className="mx-auto flex max-w-xl flex-col gap-3 px-[18px] pb-6 pt-3">
                <PostView mode={{ kind: 'auth', userId: ME }} eventId={POST_ID} />
              </main>
            )}
            {screen === 'follow' && <FollowClient token={TOKEN} initialSummary={sharedSummary} />}
            {screen === 'alerts' && (
              <main className="mx-auto flex max-w-xl flex-col gap-3 px-[18px] pb-6 pt-[18px]"><NotificationSettings /></main>
            )}
            {screen === 'sharing' && (
              <main className="mx-auto flex max-w-xl flex-col gap-3 px-[18px] pb-6 pt-[18px]"><SharingCard endDate="2026-12-01" /></main>
            )}
          </div>
        </ToastProvider>
      </MoneyProvider>
    </TripScopeProvider>
  )
}
