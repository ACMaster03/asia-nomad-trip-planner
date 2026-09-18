'use client'
import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Compass, Link2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchMyFollowing } from '@/lib/follow/follows'
import { tk } from '@/lib/trips/keys'
import { OnboardingWizard } from '@/components/trips/OnboardingWizard'
import HomeActivity from './HomeActivity'

// Home for an account with no trip of its own. Someone who came in through a
// follow link is a follower first: they get the feed of the people they
// follow and a door to planning a trip, never the onboarding wizard by
// itself. The header with the account avatar is always there — it is the
// only way to Account, and so to signing out (Patrik, 2026-09-18: the
// no-trip screen used to replace it).
//
// The "plan a trip" card can be dismissed; the quieter row at the bottom
// keeps the door open. Dismissal is per device, in localStorage.

const DISMISS_KEY = 'livhold.planCardDismissed'
const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
const readDismissed = () => {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}
const serverDismissed = () => false
function dismissPlanCard() {
  try {
    window.localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    /* private window: the card simply comes back next visit */
  }
  listeners.forEach((fn) => fn())
}

export default function FollowerHome({ userEmail, userName, userId }: { userEmail?: string; userName?: string; userId?: string }) {
  const sb = createClient()
  const following = useQuery({ queryKey: tk.following, queryFn: () => fetchMyFollowing(sb), staleTime: 5 * 60_000, retry: false })
  const dismissed = useSyncExternalStore(subscribe, readDismissed, serverDismissed)
  const [planning, setPlanning] = useState(false)

  if (planning) {
    // The wizard brings its own full-bleed wash — no page padding here.
    return (
      <main>
        <OnboardingWizard />
      </main>
    )
  }

  const nobody = !following.isPending && !(following.data?.length ?? 0)
  const initial = (userName?.trim()[0] ?? userEmail?.trim()[0] ?? '?').toUpperCase()
  const first = userName?.trim()

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-3 px-[18px] pb-6 pt-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-medium uppercase tracking-[.14em] text-ac2-deep">
            {nobody ? 'Welcome' : 'Following along'}
          </div>
          <h1 className="mt-1 font-serif text-[28px] font-semibold leading-[1.12] tracking-[-.01em]">
            {first ? `Hello, ${first}` : 'Hello'}
          </h1>
          <p className="mt-[5px] text-base text-tx2">
            {nobody ? 'No trip of your own yet, and nobody followed yet.' : 'The people you follow, as they go.'}
          </p>
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

      {/* Came in through a follow link but the follow never completed — the
          magic link opened in another browser, or storage was refused. The
          link itself still works: signed in, it finishes in one tap. */}
      {nobody && (
        <div className="flex gap-3 rounded-[var(--r)] bg-sf p-4">
          <Link2 className="mt-0.5 size-5 flex-none text-ac2" aria-hidden />
          <p className="text-base leading-[1.5] text-tx2">
            <span className="font-semibold text-tx">Did someone send you a follow link?</span> Open it again now
            that you are signed in — one tap follows them, and their journey shows up here.
          </p>
        </div>
      )}

      {!dismissed && (
        <section className="relative rounded-[var(--r)] bg-sf p-4">
          <button
            type="button"
            onClick={dismissPlanCard}
            aria-label="Dismiss"
            className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-full text-tx3"
          >
            <X className="size-5" aria-hidden />
          </button>
          <div className="flex items-start gap-3 pr-8">
            <Compass className="mt-0.5 size-5 flex-none text-ac2" aria-hidden />
            <div className="min-w-0 grow">
              <div className="font-serif text-lg font-semibold">Going somewhere yourself?</div>
              <p className="mt-0.5 text-base leading-[1.5] text-tx2">
                Set up a trip in three short steps. The people who follow you see it only when you let them.
              </p>
              <button
                type="button"
                onClick={() => setPlanning(true)}
                className="mt-3 w-full rounded-[calc(var(--r)-3px)] bg-ac py-3 text-base font-semibold text-on"
              >
                Plan a trip
              </button>
            </div>
          </div>
        </section>
      )}

      {!following.isPending && <HomeActivity own={[]} ownPending={false} userId={userId} />}
      {following.isPending && <p className="text-base text-tx2">Loading…</p>}

      {dismissed && (
        <button type="button" onClick={() => setPlanning(true)} className="flex w-full items-center justify-between rounded-[var(--r)] bg-sf p-4 text-left">
          <span className="flex items-center gap-3">
            <Compass className="size-5 flex-none text-ac2" aria-hidden />
            <span className="block text-base font-semibold">Plan a trip of your own</span>
          </span>
          <ChevronRight aria-hidden className="size-5 flex-none text-ac2" />
        </button>
      )}
    </main>
  )
}
