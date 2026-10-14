'use client'
import Link from 'next/link'
import { approxMoney } from '@/lib/trips/moneyText'
import { activeSubs, monthlyRunRate } from '@/lib/trips/subscriptions'
import type { Subscription } from '@/lib/trips/types'
import { CardLabel } from './CardLabel'
import { SubscriptionRow, SubscriptionsEmpty } from './SubscriptionRow'

// Subscriptions (#37; the phone's SubscriptionsCard, Patrik, 29 Sep): Latest's
// pattern, the three that charge next, always open, and "All subscriptions ›"
// to the page that holds them all, what they add up to, the cancelled ones and
// the way to add one (/money/subscriptions, round 4b). No card on Money folds.
export function SubscriptionsCard({ subs, rates, fmt, todayIso, canEdit, onAdd, onEdit, onToggleRemind }: {
  subs: Subscription[]
  rates: Record<string, number>
  fmt: (n: number) => string
  todayIso: string
  canEdit: boolean
  onAdd: () => void
  onEdit: (sub: Subscription) => void
  onToggleRemind: (sub: Subscription) => void
}) {
  const active = activeSubs(subs, todayIso)
  const monthly = monthlyRunRate(active, rates)
  return (
    <div className="lv-enter rounded-[var(--r)] bg-sf px-4 py-3 text-tx">
      <div className="flex items-center justify-between gap-3 pb-1">
        <CardLabel mauve>Subscriptions</CardLabel>
        {subs.length > 0 && <Link href="/money/subscriptions" prefetch className="text-[13.5px] font-medium text-ac">All subscriptions ›</Link>}
      </div>
      {subs.length === 0 ? (
        <SubscriptionsEmpty canEdit={canEdit} onAdd={onAdd} />
      ) : active.length === 0 ? (
        <p className="py-2.5 text-[14px] text-tx2">None active. The cancelled ones are under All subscriptions.</p>
      ) : (
        <div className="divide-y divide-ln">
          {active.slice(0, 3).map((sub) => (
            <SubscriptionRow key={sub.id} sub={sub} rates={rates} fmt={fmt} todayIso={todayIso} canEdit={canEdit} onEdit={onEdit} onToggleRemind={onToggleRemind} />
          ))}
          <div className="flex justify-between pt-2.5 text-[13.5px] text-tx2">
            <span>{active.length} active</span>
            <span>{approxMoney(monthly, fmt)} a month</span>
          </div>
        </div>
      )}
    </div>
  )
}
