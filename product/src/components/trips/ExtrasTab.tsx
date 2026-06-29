'use client'
import { useState } from 'react'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { fmtHUF, toHUF } from '@/lib/trips/format'
import { ExtraForm } from './ExtraForm'
import { SaveError } from './SaveError'
import CreateTripEmptyState from './CreateTripEmptyState'
import type { Extra } from '@/lib/trips/types'

export function ExtrasTab() {
  const { trip } = useTripScreen()
  const mut = useTripMutation()
  const [modal, setModal] = useState<{ extra: Extra | null } | null>(null)
  if (trip.isPending) return <main className="mx-auto max-w-5xl p-6">Loading…</main>
  if (!trip.data) return <CreateTripEmptyState />
  const s = trip.data.state
  const currencies = Object.keys(s.rates)
  const total = s.extras.filter((e) => e.include).reduce((a, e) => a + toHUF(e.amount, e.cur, s.rates), 0)

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
    <main className="mx-auto max-w-5xl px-6 pb-6">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm text-neutral-500">One-off, upfront costs (visas, insurance, gear). Included total: <b>{fmtHUF(total)}</b>.</p>
        <button onClick={() => setModal({ extra: null })} className="rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white">+ Add</button>
      </div>
      <SaveError show={mut.isError} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-neutral-500">
            <th className="py-1 pr-2">In</th><th className="pr-4">Item</th><th className="pr-4">Category</th><th className="pr-4">Amount</th><th className="pr-4">In HUF</th><th /></tr></thead>
          <tbody>
            {s.extras.map((x) => (
              <tr key={x.id} className={'border-t border-neutral-200 dark:border-neutral-800 ' + (x.include ? '' : 'opacity-50')}>
                <td className="py-1 pr-2"><input type="checkbox" aria-label="Include in budget" checked={!!x.include} onChange={() => toggle(x.id)} /></td>
                <td className="pr-4 font-medium">{x.label}</td>
                <td className="pr-4 text-neutral-500">{x.category}</td>
                <td className="pr-4 whitespace-nowrap">{x.amount} {x.cur}</td>
                <td className="pr-4 text-neutral-500">{fmtHUF(toHUF(x.amount, x.cur, s.rates))}</td>
                <td className="whitespace-nowrap">
                  <button onClick={() => setModal({ extra: x })} className="text-xs text-teal-600 hover:underline">edit</button>
                  <button onClick={() => del(x.id)} className="ml-3 text-xs text-red-600 hover:underline">delete</button>
                </td>
              </tr>
            ))}
            {!s.extras.length && <tr><td colSpan={6} className="py-3 text-neutral-500">No one-off costs yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {modal && <ExtraForm initial={modal.extra} currencies={currencies} onCancel={() => setModal(null)} onSave={upsert} />}
    </main>
  )
}
