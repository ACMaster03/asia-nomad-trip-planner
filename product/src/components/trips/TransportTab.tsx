'use client'
import { useState } from 'react'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { fmtHUF, toHUF } from '@/lib/trips/format'
import { TransportForm } from './TransportForm'
import { SaveError } from './SaveError'
import type { TransportLeg } from '@/lib/trips/types'

export function TransportTab() {
  const { trip } = useTripScreen()
  const mut = useTripMutation()
  const [modal, setModal] = useState<{ leg: TransportLeg | null } | null>(null)
  if (!trip.data) return null
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

  return (
    <main className="mx-auto max-w-5xl px-6 pb-6">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm text-neutral-500">Flights and other legs between stops. Tick to count a leg in the budget.</p>
        <button onClick={() => setModal({ leg: null })} className="rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white">+ Add</button>
      </div>
      <SaveError show={mut.isError} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-neutral-500">
            <th className="py-1 pr-2">In</th><th className="pr-4">Type</th><th className="pr-4">Route</th><th className="pr-4">Date</th><th className="pr-4">Price</th><th className="pr-4">Status</th><th /></tr></thead>
          <tbody>
            {s.transport.map((x) => (
              <tr key={x.id} className={'border-t border-neutral-200 dark:border-neutral-800 ' + (x.include ? '' : 'opacity-50')}>
                <td className="py-1 pr-2"><input type="checkbox" aria-label="Include in budget" checked={!!x.include} onChange={() => toggle(x.id)} /></td>
                <td className="pr-4">{x.type}</td>
                <td className="pr-4 font-medium whitespace-nowrap">{x.from} → {x.to}</td>
                <td className="pr-4 whitespace-nowrap">{x.date || '—'}</td>
                <td className="pr-4 whitespace-nowrap">{x.price} {x.cur} <span className="text-xs text-neutral-500">({fmtHUF(toHUF(x.price, x.cur, s.rates))})</span></td>
                <td className="pr-4">{x.status}</td>
                <td className="whitespace-nowrap">
                  <button onClick={() => setModal({ leg: x })} className="text-xs text-teal-600 hover:underline">edit</button>
                  <button onClick={() => del(x.id)} className="ml-3 text-xs text-red-600 hover:underline">delete</button>
                </td>
              </tr>
            ))}
            {!s.transport.length && <tr><td colSpan={7} className="py-3 text-neutral-500">No transport legs yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {modal && <TransportForm initial={modal.leg} currencies={currencies} onCancel={() => setModal(null)} onSave={upsert} />}
    </main>
  )
}
