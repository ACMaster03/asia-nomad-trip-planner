'use client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchFollowerAccess, fetchMyFollowerCount, setFollowerAccess } from '@/lib/follow/follows'
import { Sheet } from './Sheet'

// New trips start hidden from the people who follow you (decision log #3 in
// docs/SOCIAL-SCOPE.md). The first check-in is the moment to ask — once per
// trip. "Keep it to myself" is remembered on this device so the sheet does
// not come back; Account → Follow links has the switch for later.

const KEY = (tripId: string) => `livhold.followerNudge.${tripId}`

/** Should the sheet open after this check-in? Fails soft: any error → no. */
export async function maybeNudge(sb: SupabaseClient, tripId: string): Promise<boolean> {
  try {
    if (window.localStorage.getItem(KEY(tripId))) return false
  } catch {
    /* storage unavailable: ask anyway, at most once per session */
  }
  try {
    const [access, count] = await Promise.all([fetchFollowerAccess(sb, tripId), fetchMyFollowerCount(sb)])
    return access === 'off' && count > 0
  } catch {
    return false
  }
}

function remember(tripId: string) {
  try {
    window.localStorage.setItem(KEY(tripId), '1')
  } catch {
    /* fine */
  }
}

export function FollowerNudge({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const sb = createClient()
  const open = useMutation({
    mutationFn: () => setFollowerAccess(sb, tripId, 'on'),
    onSuccess: () => {
      remember(tripId)
      qc.invalidateQueries({ queryKey: ['follower-access', tripId] })
      onClose()
    },
  })
  const keep = () => {
    remember(tripId)
    onClose()
  }
  return (
    <Sheet label="Show this trip to your followers?" onClose={keep}>
      <div className="flex items-start gap-3">
        <Users size={22} strokeWidth={2} className="mt-1 flex-none text-ac2" aria-hidden />
        <div>
          <h2 className="font-serif text-[21px] font-semibold">Show this trip to your followers?</h2>
          <p className="mt-1 text-base leading-[1.5] text-tx2">
            People who follow you can&apos;t see this trip yet. Open it and your check-ins land on their Home.
            You can change this any time under Account.
          </p>
        </div>
      </div>
      {open.isError && <p className="text-base text-warn">Could not open the trip — try again from Account.</p>}
      <button
        type="button"
        onClick={() => open.mutate()}
        disabled={open.isPending}
        className="rounded-[var(--rCtl)] bg-ac py-3.5 text-base font-semibold text-on disabled:opacity-50"
      >
        {open.isPending ? '…' : 'Show my followers'}
      </button>
      <button type="button" onClick={keep} className="rounded-[var(--rCtl)] border-[1.5px] border-ln2 bg-sf py-3 text-base font-medium">
        Keep it to myself
      </button>
    </Sheet>
  )
}
