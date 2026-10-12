'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchMyFollowing } from '@/lib/follow/follows'
import { tk } from '@/lib/trips/keys'
import { longDate } from '@/lib/trips/format'
import { OnboardingWizard } from '@/components/trips/OnboardingWizard'
import { Modal } from '@/components/trips/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { AccountAvatar } from '@/components/ui/Avatar'
import { Waiting } from '@/components/ui/TravelLoader'
import FollowingSection from './FollowingSection'

// Home for someone with no journey of their own, as the phone draws it
// (ios/Livhold/Home/HomeScreen.swift, the empty phase; #126, #130): following
// people, Home is their journeys and the latest posts, with a quiet door to
// plan one's own at the bottom. Following nobody, it is "Where to?".
//
// A follow link finishes on its own: PendingFollow (the app layout) completes
// the follow and opens the journey, so nothing here asks for a link. Someone
// who signed up first and has the link in a message still needs to know that
// the link is the door, so "Where to?" carries one line about it (Petra,
// 12 Oct; the phone's card does not, which is worth the same line there).
// The link's page has the Follow button: signed in, it follows at once.

export default function FollowerHome({ userEmail, userName, userId }: { userEmail?: string; userName?: string; userId?: string }) {
  const sb = createClient()
  const following = useQuery({ queryKey: tk.following, queryFn: () => fetchMyFollowing(sb), staleTime: 5 * 60_000, retry: false })
  const [planning, setPlanning] = useState(false)
  const first = userName?.trim().split(/\s+/)[0]
  const today = new Date()
  const todayIso = today.toISOString().slice(0, 10)
  const nobody = following.isSuccess && following.data.length === 0

  const header = (sub?: string) => (
    <PageHeader
      eyebrow={longDate(today)}
      title={first ? `Hi, ${first}` : 'Hi, traveller'}
      sub={sub}
      right={<AccountAvatar userName={userName} userEmail={userEmail} />}
    />
  )

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-3 px-4 pb-6 pt-3">
      {following.isPending ? (
        <>
          {header()}
          <Waiting label="Getting your people" />
        </>
      ) : following.isError ? (
        <>
          {header('Could not load the people you follow.')}
          <button
            type="button"
            onClick={() => following.refetch()}
            className="rounded-[var(--r)] bg-sf p-4 text-left text-[15px] leading-[1.5] text-tx2"
          >
            <span className="font-semibold text-tx">Couldn’t load</span> · tap to try again
          </button>
        </>
      ) : nobody ? (
        <>
          {header()}
          <NoJourneyCard onPlan={() => setPlanning(true)} />
          <p className="flex items-start gap-2.5 px-1 pt-1 text-[14px] leading-[1.45] text-tx2">
            <Link2 aria-hidden className="mt-0.5 size-4 flex-none text-ac2" strokeWidth={2} />
            <span>
              <span className="font-semibold text-tx">Following someone?</span> Open the link they sent you and tap Follow.
            </span>
          </p>
        </>
      ) : (
        <>
          {header('The people you follow, as they go.')}
          <FollowingSection today={todayIso} userId={userId} />
          <PlanOwnRow onPlan={() => setPlanning(true)} />
        </>
      )}
      {planning && (
        <Modal title="New journey" onClose={() => setPlanning(false)}>
          <OnboardingWizard onDone={() => setPlanning(false)} />
        </Modal>
      )}
    </main>
  )
}

/** "Where to?" on the journey wash: the first journey, for someone following nobody. */
export function NoJourneyCard({ onPlan }: { onPlan: () => void }) {
  return (
    <div className="lv-enter rounded-[var(--r)] px-[18px] py-[22px] text-tx lv-journey-wash">
      <h2 className="font-serif text-[26px] font-semibold leading-[1.15]">Where to?</h2>
      <p className="mt-1.5 text-[15px] leading-[1.45] text-tx2">
        Plan your first journey: the stops, the stays and what it all costs, in one place.
      </p>
      <button
        type="button"
        onClick={onPlan}
        className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-ac px-[18px] text-[15px] font-semibold text-on"
      >
        <Plus aria-hidden className="size-4" strokeWidth={2.6} /> Plan a journey
      </button>
    </div>
  )
}

/** "Going somewhere yourself? Plan a journey": the quiet door for a follower. */
export function PlanOwnRow({ onPlan }: { onPlan: () => void }) {
  return (
    <button type="button" onClick={onPlan} className="flex min-h-11 w-full items-center justify-center gap-1 pt-2 text-center text-[15px] text-tx3">
      Going somewhere yourself? <span className="font-semibold text-ac">Plan a journey</span>
    </button>
  )
}
