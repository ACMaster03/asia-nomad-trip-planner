'use client'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Compass } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchMyFollowing } from '@/lib/follow/follows'
import { tk } from '@/lib/trips/keys'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'
import HomeActivity from './HomeActivity'

// Home for an account with no trip of its own. Someone who came in through a
// follow link is a follower first: they get the feed of the people they
// follow and a quiet door to planning a trip, not the onboarding wizard.
// An account that follows nobody still gets the wizard — that IS the empty
// state for a fresh traveller.
export default function FollowerHome({ userEmail, userName, userId }: { userEmail?: string; userName?: string; userId?: string }) {
  const sb = createClient()
  const following = useQuery({ queryKey: tk.following, queryFn: () => fetchMyFollowing(sb), staleTime: 5 * 60_000, retry: false })

  if (following.isPending) return <main className="mx-auto max-w-5xl p-6">Loading…</main>
  // Follows nobody and has no trip: the calm no-trip screen, wizard behind one tap.
  if (!following.data?.length) return <CreateTripEmptyState />

  const initial = (userName?.trim()[0] ?? userEmail?.trim()[0] ?? '?').toUpperCase()
  const first = userName?.trim()
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-3 px-[18px] pb-6 pt-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-medium uppercase tracking-[.14em] text-ac2-deep">Following along</div>
          <h1 className="mt-1 font-serif text-[28px] font-semibold leading-[1.12] tracking-[-.01em]">
            {first ? `Hello, ${first}` : 'Hello'}
          </h1>
          <p className="mt-[5px] text-base text-tx2">The people you follow, as they go.</p>
        </div>
        <Link
          href="/account"
          aria-label="Account"
          title={userName || userEmail || 'Account'}
          className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full bg-ac2-soft text-[17px] font-semibold text-ac2-deep"
        >
          {initial}
        </Link>
      </div>

      <HomeActivity own={[]} ownPending={false} userId={userId} />

      <Link href="/itinerary" className="flex items-center justify-between rounded-[var(--r)] bg-sf p-4">
        <span className="flex items-center gap-3">
          <Compass className="size-5 flex-none text-ac2" aria-hidden />
          <span>
            <span className="block text-base font-semibold">Going somewhere yourself?</span>
            <span className="block text-base text-tx2">Plan a trip of your own — the people who follow you will see it when you let them.</span>
          </span>
        </span>
        <ChevronRight aria-hidden className="size-5 flex-none text-ac2" />
      </Link>
    </main>
  )
}
