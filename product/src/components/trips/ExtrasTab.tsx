'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { useMoney } from '@/lib/trips/Money'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { toBase } from '@/lib/trips/format'
import { ExtraForm } from './ExtraForm'
import { SaveError } from './SaveError'
import { ViewerNotice } from './ViewerNotice'
import CreateTripEmptyState from './CreateTripEmptyState'
import { useTripRole } from '@/lib/trips/useTripRole'
import type { Extra } from '@/lib/trips/types'

// 24px visual tick inside a 44px tap target: the negative margin keeps the
// layout where the bare box sat, and the padding doubles as a generous
// stopPropagation zone so a near-miss toggles instead of opening the editor.
const tickBtn = '-m-2.5 flex size-11 flex-none items-center justify-center'
const tick = (on: boolean) =>
  'flex h-6 w-6 items-center justify-center rounded-lg text-base font-semibold transition-colors duration-[180ms] ' +
  (on ? 'border border-ac bg-ac text-on' : 'border-[1.5px] border-ln3 text-transparent')

export function ExtrasTab() {
  const { fmt } = useMoney()
  const { trip } = useTripScreen()
  const mut = useTripMutation()
  const { canEdit } = useTripRole()
  const [modal, setModal] = useState<{ extra: Extra | null } | null>(null)
  if (trip.isPending) return <main className="mx-auto max-w-5xl p-6">Loading…</main>
  if (!trip.data) return <CreateTripEmptyState />
  const s = trip.data.state
  const currencies = Object.keys(s.rates)
  const total = s.extras.filter((e) => e.include).reduce((a, e) => a + toBase(e.amount, e.cur, s.rates), 0)

  const upsert = (it: Extra) => {
    mut.mutate((st) => ({
      ...st,
      extras: st.extras.some((x) => x.id === it.id) ? st.extras.map((x) => (x.id === it.id ? it : x)) : [...st.extras, it],
    }))
    setModal(null)
  }
  const del = (id: string) => { if (confirm('Delete this cost?')) mut.mutate((st) => ({ ...st, extras: st.extras.filter((x) => x.id !== id) })) }
  const toggle = (id: string) => mut.mutate((st) => ({ ...st, extras: st.extras.map((x) => (x.id === id ? { ...x, include: !x.include } : x)) }))

  return (
    <main className="mx-auto max-w-xl px-[18px] pb-6 pt-[18px]">
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-serif text-[25px] font-semibold">Extras</h1>
        {canEdit && (
          <button onClick={() => setModal({ extra: null })} className="rounded-[calc(var(--r)-3px)] bg-ac px-4 py-2.5 text-base font-semibold text-on">
            + Add
          </button>
        )}
      </div>
      <p className="mb-4 mt-1 text-base text-tx2">
        Visas, insurance, gear. Untick anything you&apos;re not committed to yet.
        {canEdit && <span className="font-medium text-ac2-deep"> Tap a card to edit or delete it.</span>}
      </p>
      <ViewerNotice />
      <SaveError show={mut.isError} error={mut.error} />

      <div className="flex flex-col gap-3">
        {s.extras.map((x) => (
          <div
            key={x.id}
            role={canEdit ? 'button' : undefined}
            tabIndex={canEdit ? 0 : undefined}
            onClick={canEdit ? () => setModal({ extra: x }) : undefined}
            onKeyDown={canEdit ? (e) => { if (e.key === 'Enter') setModal({ extra: x }) } : undefined}
            className={'lv-enter rounded-[var(--r)] bg-sf p-[18px] ' + (canEdit ? 'cursor-pointer ' : '') + (x.include ? '' : 'opacity-60')}
          >
            <div className="flex items-start gap-3">
              <button
                type="button"
                aria-label="Include in budget"
                aria-pressed={!!x.include}
                disabled={!canEdit}
                onClick={(e) => { e.stopPropagation(); toggle(x.id) }}
                className={tickBtn}
              >
                <span aria-hidden className={tick(!!x.include)}>✓</span>
              </button>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[18px] font-semibold">{x.label}</span>
                <span className="block text-base text-tx2">{x.category}</span>
              </span>
              <span className="flex-none text-right">
                <span className="block whitespace-nowrap text-[19px] font-semibold">{x.amount} {x.cur}</span>
                <span className="block text-base text-tx2">{fmt(toBase(x.amount, x.cur, s.rates))}</span>
              </span>
            </div>
            {canEdit && (
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className={'text-base font-medium ' + (x.include ? 'text-ac' : 'text-tx3')}>
                  {x.include ? 'In the budget' : 'Not counted'}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); del(x.id) }}
                  className="-my-2.5 inline-flex min-h-11 flex-none items-center text-base font-semibold text-ac2"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
        {!s.extras.length && (
          <div className="rounded-[var(--r)] bg-sf p-[18px] text-base text-tx2">No one-off costs yet.</div>
        )}
        {s.extras.length > 0 && (
          <Link href="/money" className="flex items-center justify-between rounded-[var(--r)] bg-sf p-4">
            <span className="text-base font-medium text-tx2">
              {s.extras.length} {s.extras.length === 1 ? 'extra' : 'extras'} · see {fmt(total)} in Money
            </span>
            <ChevronRight aria-hidden className="size-5 text-ac2" />
          </Link>
        )}
      </div>

      {modal && <ExtraForm initial={modal.extra} currencies={currencies} onCancel={() => setModal(null)} onSave={upsert} />}
    </main>
  )
}
