'use client'
import { useState } from 'react'
import { useConfirm } from '@/components/Confirm'
import type { useTripMutation } from '@/lib/trips/useTripMutation'
import type { Subscription } from '@/lib/trips/types'

// What a subscription's form and bell do, shared by Money's card and the
// Subscriptions page (round 4b): one place for the save, the delete that asks
// first, and the reminder switch. The page renders the SubscriptionSheet
// itself, because its save-error banner watches the mutation.
export function useSubscriptionEdits(stateMut: ReturnType<typeof useTripMutation>) {
  const confirm = useConfirm()
  const [subSheet, setSubSheet] = useState<{ sub: Subscription | null } | null>(null)

  function saveSub(sub: Subscription) {
    stateMut.mutate((cur) => {
      const list = cur.subscriptions ?? []
      return {
        ...cur,
        subscriptions: list.some((x) => x.id === sub.id) ? list.map((x) => (x.id === sub.id ? sub : x)) : [...list, sub],
      }
    })
    setSubSheet(null)
  }
  async function delSub(sub: Subscription) {
    const ok = await confirm({
      title: 'Delete this subscription?',
      body: '“Mark cancelled” keeps what it already charged; deleting forgets it.',
    })
    if (!ok) return
    stateMut.mutate((cur) => ({ ...cur, subscriptions: (cur.subscriptions ?? []).filter((x) => x.id !== sub.id) }))
    setSubSheet(null)
  }
  function toggleRemind(sub: Subscription) {
    stateMut.mutate((cur) => ({
      ...cur,
      subscriptions: (cur.subscriptions ?? []).map((x) =>
        x.id === sub.id ? { ...x, remind: !x.remind, leadDays: x.leadDays ?? 3 } : x,
      ),
    }))
  }
  return { subSheet, setSubSheet, saveSub, delSub, toggleRemind }
}
