'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { useMoney } from '@/lib/trips/Money'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { toBase } from '@/lib/trips/format'
import { TransportForm } from './TransportForm'
import { SaveError } from './SaveError'
import { ViewerNotice } from './ViewerNotice'
import CreateTripEmptyState from './CreateTripEmptyState'
import { useTripRole } from '@/lib/trips/useTripRole'
import type { TransportLeg } from '@/lib/trips/types'

const tick = (on: boolean) =>
  'flex h-6 w-6 flex-none items-center justify-center rounded-lg text-base font-semibold transition-colors duration-[180ms] ' +
  (on ? 'border border-ac bg-ac text-on' : 'border-[1.5px] border-ln3 text-transparent')

const fmtD = (d: string) => {
  const t = new Date(d)
  return Number.isNaN(+t) ? (d || '—') : t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function TransportTab() {
  const { fmt } = useMoney()
  const { trip } = useTripScreen()
  const mut = useTripMutation()
  const { canEdit } = useTripRole()
  const [modal, setModal] = useState<{ leg: TransportLeg | null } | null>(null)
  if (trip.isPending) return <main className="mx-auto max-w-5xl p-6">Loading…</main>
  if (!trip.data) return <CreateTripEmptyState />
  const s = trip.data.state
  const currencies = Object.keys(s.rates)

  const upsert = (it: TransportLeg) => {
    mut.mutate((st) => ({
      ...st,
      transport: st.transport.some((x) => x.id === it.id) ? st.transport.map((x) => (x.id === it.id ? it : x)) : [...st.transport, it],
    }))
    setModal(null)
  }
  const del = (id: string) => { if (confirm('Delete this leg?')) mut.mutate((st) => ({ ...st, transport: st.transport.filter((x) => x.id !== id) })) }
  const toggle = (id: string) => mut.mutate((st) => ({ ...st, transport: st.transport.map((x) => (x.id === id ? { ...x, include: !x.include } : x)) }))

  const included = s.transport.filter((x) => x.include)
  const total = included.reduce((a, x) => a + toBase(x.price, x.cur, s.rates), 0)

  return (
    <main className="mx-auto max-w-xl px-[18px] pb-6 pt-[18px]">
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-serif text-[25px] font-semibold">Transport</h1>
        {canEdit && (
          <button onClick={() => setModal({ leg: null })} className="rounded-[calc(var(--r)-3px)] bg-ac px-4 py-2.5 text-base font-semibold text-on">
            + Add
          </button>
        )}
      </div>
      <p className="mb-4 mt-1 text-base text-tx2">
        Flights and other legs. Tick a leg to hold its money in the budget, booked or not.
        {canEdit && <span className="font-medium text-ac2-deep"> Tap a card to edit or delete it.</span>}
      </p>
      <ViewerNotice />
      <SaveError show={mut.isError} error={mut.error} />

      <div className="flex flex-col gap-3">
        {s.transport.map((x) => (
          <div
            key={x.id}
            role={canEdit ? 'button' : undefined}
            tabIndex={canEdit ? 0 : undefined}
            onClick={canEdit ? () => setModal({ leg: x }) : undefined}
            onKeyDown={canEdit ? (e) => { if (e.key === 'Enter') setModal({ leg: x }) } : undefined}
            className={'lv-enter rounded-[var(--r)] bg-sf p-[18px] ' + (canEdit ? 'cursor-pointer ' : '') + (x.include ? '' : 'opacity-60')}
          >
            <div className="flex items-start gap-3">
              <button
                type="button"
                aria-label="Include in budget"
                aria-pressed={!!x.include}
                disabled={!canEdit}
                onClick={(e) => { e.stopPropagation(); toggle(x.id) }}
                className={tick(!!x.include)}
              >
                ✓
              </button>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[18px] font-semibold">{x.from} → {x.to}</span>
                <span className="block text-base text-tx2">
                  {x.type} · {x.date ? fmtD(x.date) : '—'}{x.provider ? ` · ${x.provider}` : ''}
                </span>
              </span>
              <span className="flex-none text-right">
                <span className="block whitespace-nowrap text-[19px] font-semibold">{x.price} {x.cur}</span>
                <span className="block text-base text-tx2">{fmt(toBase(x.price, x.cur, s.rates))}</span>
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className={'text-base font-medium capitalize ' + (x.status === 'booked' ? 'text-ac' : 'text-tx2')}>{x.status}</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); del(x.id) }}
                  className="flex-none text-base font-semibold text-ac2"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
        {!s.transport.length && (
          <div className="rounded-[var(--r)] bg-sf p-[18px] text-base text-tx2">No transport legs yet.</div>
        )}
        {s.transport.length > 0 && (
          <Link href="/money" className="flex items-center justify-between rounded-[var(--r)] bg-sf p-4">
            <span className="text-base font-medium text-tx2">
              {included.length} of {s.transport.length} {s.transport.length === 1 ? 'leg' : 'legs'} · see {fmt(total)} in Money
            </span>
            <ChevronRight aria-hidden className="size-5 text-ac2" />
          </Link>
        )}
      </div>

      {modal && <TransportForm initial={modal.leg} currencies={currencies} onCancel={() => setModal(null)} onSave={upsert} />}
    </main>
  )
}
