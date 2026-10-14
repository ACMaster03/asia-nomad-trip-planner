'use client'
import { useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Plus } from 'lucide-react'
import { useMoney } from '@/lib/trips/Money'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { useTripRole } from '@/lib/trips/useTripRole'
import { useToday } from '@/lib/useToday'
import { useCameFrom } from '@/lib/useCameFrom'
import { moneyModel } from '@/lib/trips/moneyModel'
import { approxMoney } from '@/lib/trips/moneyText'
import { activeSubs, cancelledSubs, monthlyRunRate, subsAhead } from '@/lib/trips/subscriptions'
import { SaveError } from '@/components/trips/SaveError'
import { ViewerNotice } from '@/components/trips/ViewerNotice'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'
import { CardLabel } from './CardLabel'
import { SubscriptionRow, SubscriptionsEmpty } from './SubscriptionRow'
import { SubscriptionSheet } from './SubscriptionSheet'
import { useSubscriptionEdits } from './useSubscriptionEdits'

// Every subscription (the phone's SubscriptionsScreen, round 4b): the active
// ones with what they add up to, a month and across the days left, then the
// cancelled ones, struck through. Opens from Money's card ("All subscriptions
// ›"), where the three that charge next stay. The + adds one; a row opens its
// form; the bell is one tap.
export default function SubscriptionsPage() {
  const { fmt } = useMoney()
  const { trip, cityIdx } = useTripScreen()
  const stateMut = useTripMutation()
  const { canEdit } = useTripRole()
  const today = useToday()
  const router = useRouter()
  const cameFrom = useCameFrom('/money/subscriptions')
  const edits = useSubscriptionEdits(stateMut)
  const model = useMemo(
    () => (trip.data && today ? moneyModel(trip.data.state, trip.data.ledger, cityIdx, today) : null),
    [trip.data, cityIdx, today],
  )

  if (trip.isPending || (trip.data && !today)) {
    return <main className="mx-auto max-w-xl p-6 text-base text-tx2">Loading…</main>
  }
  if (!trip.data || !today || !model) return <CreateTripEmptyState />
  const s = trip.data.state
  const subs = model.subs
  const active = activeSubs(subs, today)
  const cancelled = cancelledSubs(subs)
  const monthly = monthlyRunRate(active, s.rates)
  const ahead = subsAhead(active, s.rates, today, model.tripEnd || undefined)
  const row = (sub: typeof subs[number]) => (
    <SubscriptionRow
      key={sub.id} sub={sub} rates={s.rates} fmt={fmt} todayIso={today} canEdit={canEdit}
      onEdit={(x) => edits.setSubSheet({ sub: x })} onToggleRemind={edits.toggleRemind}
    />
  )

  return (
    <main className="mx-auto grid w-full max-w-xl grid-cols-1 items-start gap-3 px-4 pb-6 pt-[10px] text-tx">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/money"
            onClick={(e) => { if (cameFrom.current === '/money') { e.preventDefault(); router.back() } }}
            className="-ml-1.5 inline-flex min-h-11 items-center text-base font-semibold text-ac2-deep"
          >
            <ChevronLeft aria-hidden className="size-5" />Money
          </Link>
          <h1 className="font-serif text-[25px] font-semibold leading-[1.15] tracking-[-.01em]">Subscriptions</h1>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => edits.setSubSheet({ sub: null })}
            aria-label="Add a subscription"
            title="Add a subscription"
            className="mb-1 flex size-[42px] flex-none items-center justify-center rounded-full border border-ln bg-sf text-ac2"
          >
            <Plus aria-hidden className="size-[18px]" strokeWidth={2.6} />
          </button>
        )}
      </div>
      <ViewerNotice />
      <SaveError show={stateMut.isError} error={stateMut.error} />
      {subs.length === 0 ? (
        <div className="rounded-[var(--r)] bg-sf px-4 py-3">
          <SubscriptionsEmpty canEdit={canEdit} onAdd={() => edits.setSubSheet({ sub: null })} />
        </div>
      ) : (
        <>
          <div className="rounded-[var(--r)] bg-sf px-4 py-3">
            {active.length === 0 && <p className="py-2.5 text-[14px] text-tx2">None active.</p>}
            <div className="divide-y divide-ln">{active.map(row)}</div>
            {active.length > 0 && (
              <div className="mt-1 border-t border-ln pt-2.5">
                <div className="flex justify-between text-[14.5px]">
                  <span className="text-tx2">{active.length} active</span>
                  <span className="font-semibold">{approxMoney(monthly, fmt)} a month</span>
                </div>
                {ahead && ahead.days > 0 && (
                  <div className="mt-1 flex justify-between text-[13px] text-tx2">
                    <span>across the {ahead.days} days left</span>
                    <span>{approxMoney(ahead.total, fmt)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          {cancelled.length > 0 && (
            <div className="rounded-[var(--r)] bg-sf px-4 py-3">
              <div className="pb-1"><CardLabel>Cancelled</CardLabel></div>
              <div className="divide-y divide-ln">{cancelled.map(row)}</div>
            </div>
          )}
        </>
      )}
      {edits.subSheet && (
        <SubscriptionSheet
          initial={edits.subSheet.sub}
          rates={s.rates}
          todayIso={today}
          onSave={edits.saveSub}
          onDelete={edits.subSheet.sub ? edits.delSub : undefined}
          onClose={() => edits.setSubSheet(null)}
        />
      )}
    </main>
  )
}
