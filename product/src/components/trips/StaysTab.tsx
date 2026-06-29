'use client'
import { useState } from 'react'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { fmtHUF, toHUF } from '@/lib/trips/format'
import { StayForm } from './StayForm'
import { SaveError } from './SaveError'
import CreateTripEmptyState from './CreateTripEmptyState'
import type { Stay } from '@/lib/trips/types'

export function StaysTab() {
  const { trip } = useTripScreen()
  const mut = useTripMutation()
  const [modal, setModal] = useState<{ stay: Stay | null } | null>(null)
  if (trip.isPending) return <main className="mx-auto max-w-5xl p-6">Loading…</main>
  if (!trip.data) return <CreateTripEmptyState />
  const s = trip.data.state
  const currencies = Object.keys(s.rates)
  const cityOf = (segId: string) => s.segments.find((x) => x.id === segId)?.city ?? '—'

  const upsert = (it: Stay) => {
    mut.mutate((st) => ({
      ...st,
      stays: st.stays.some((x) => x.id === it.id) ? st.stays.map((x) => (x.id === it.id ? it : x)) : [...st.stays, it],
    }))
    setModal(null)
  }
  const del = (id: string) => { if (confirm('Delete this option?')) mut.mutate((st) => ({ ...st, stays: st.stays.filter((x) => x.id !== id) })) }
  const toggle = (id: string) => mut.mutate((st) => ({ ...st, stays: st.stays.map((x) => (x.id === id ? { ...x, include: !x.include } : x)) }))

  return (
    <main className="mx-auto max-w-5xl px-6 pb-6">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm text-neutral-500">Accommodation options per stop. Tick one to count it in the budget (instead of the estimate).</p>
        <button onClick={() => setModal({ stay: null })} className="rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white">+ Add</button>
      </div>
      <SaveError show={mut.isError} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-neutral-500">
            <th className="py-1 pr-2">In</th><th className="pr-4">Stop</th><th className="pr-4">Name</th><th className="pr-4">Platform</th><th className="pr-4">Price/night</th><th className="pr-4">Status</th><th /></tr></thead>
          <tbody>
            {s.stays.map((x) => (
              <tr key={x.id} className={'border-t border-neutral-200 dark:border-neutral-800 ' + (x.include ? '' : 'opacity-50')}>
                <td className="py-1 pr-2"><input type="checkbox" aria-label="Include in budget" checked={!!x.include} onChange={() => toggle(x.id)} /></td>
                <td className="pr-4">{cityOf(x.segId)}</td>
                <td className="pr-4 font-medium">{x.name}</td>
                <td className="pr-4 text-neutral-500">{x.platform}</td>
                <td className="pr-4 whitespace-nowrap">{x.ppn} {x.cur} <span className="text-xs text-neutral-500">({fmtHUF(toHUF(x.ppn, x.cur, s.rates))})</span></td>
                <td className="pr-4">{x.status}</td>
                <td className="whitespace-nowrap">
                  <button onClick={() => setModal({ stay: x })} className="text-xs text-teal-600 hover:underline">edit</button>
                  <button onClick={() => del(x.id)} className="ml-3 text-xs text-red-600 hover:underline">delete</button>
                </td>
              </tr>
            ))}
            {!s.stays.length && <tr><td colSpan={7} className="py-3 text-neutral-500">No accommodation options yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {modal && <StayForm initial={modal.stay} segments={s.segments} currencies={currencies} onCancel={() => setModal(null)} onSave={upsert} />}
    </main>
  )
}
