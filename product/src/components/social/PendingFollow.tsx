'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { followByToken } from '@/lib/follow/follows'
import { clearPendingFollow, readPendingFollow } from '@/lib/follow/pending'
import { tk } from '@/lib/trips/keys'
import { useToast } from '@/components/Toast'

// A follow started on an anonymous link page and interrupted by the sign-in
// round trip. Mounted in the (app) layout, like PendingInvites, because the
// magic link can land anywhere — the follow page, Home, or the onboarding
// wizard of a brand-new account — and the follow has to complete wherever
// that is. Renders nothing; costs nothing when there is no pending follow.
export function PendingFollow() {
  const sb = createClient()
  const qc = useQueryClient()
  const router = useRouter()
  const toast = useToast()
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    const pending = readPendingFollow()
    if (!pending) return
    ran.current = true
    clearPendingFollow()
    followByToken(sb, pending.token, pending.travellers)
      .then((r) => {
        if (!r) {
          toast('That follow link no longer works')
          return
        }
        qc.invalidateQueries({ queryKey: tk.following })
        qc.invalidateQueries({ queryKey: tk.followingFeed })
        toast(`You now follow ${r.followed.map((t) => t.name).join(' & ')}`)
        router.replace(`/journeys/${r.trip_id}`)
      })
      .catch(() => toast('Could not finish following. Open the link again'))
  }, [sb, qc, router, toast])

  return null
}
