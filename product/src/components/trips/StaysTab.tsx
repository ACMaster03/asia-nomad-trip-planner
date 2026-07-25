'use client'
import { useState } from 'react'
import { useMoney } from '@/lib/trips/Money'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { toBase } from '@/lib/trips/format'
import { StayForm } from './StayForm'
import { SaveError } from './SaveError'
import CreateTripEmptyState from './CreateTripEmptyState'
import type { Stay } from '@/lib/trips/types'

export function StaysTab() {
  const { fmt } = useMoney()
  const { trip, cities } = useTripScreen()
  const mut = useTripMutation()
  const [modal, setModal] = useState<{ stay: Stay | null } | null>(null)
  if (trip.isPending) return <main className="mx-auto max-w-5xl p-6">Loading…</main>
  if (!trip.data) return <CreateTripEmptyState />
  const s = trip.data.state
  const currencies = Object.keys(s.rates)
  const cityOf = (segId: string) => s.segments.find((x) => x.id === segId)?.city ?? '—'
  const createStop = (seg: (typeof s.segments)[number]) =>
    mut.mutate((st) => ({ ...st, segments: [...st.segments, seg] }))

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
      <SaveError show={mut.isError} error={mut.error} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {/* Phone-width: stop+platform fold under the name, deadlines+status
              hide — the row fits without sideways scrolling. */}
          <thead><tr className="text-left text-neutral-500">
            <th className="py-1 pr-2">In</th><th className="hidden pr-4 sm:table-cell">Stop</th><th className="pr-4">Name</th><th className="hidden pr-4 sm:table-cell">Platform</th><th className="pr-4">Price/night</th><th className="hidden pr-4 sm:table-cell">Deadlines</th><th className="hidden pr-4 sm:table-cell">Status</th><th /></tr></thead>
          <tbody>
            {s.stays.map((x) => (
              <tr key={x.id} className={'border-t border-neutral-200 dark:border-neutral-800 ' + (x.include ? '' : 'opacity-50')}>
                <td className="py-1 pr-2"><input type="checkbox" aria-label="Include in budget" checked={!!x.include} onChange={() => toggle(x.id)} /></td>
                <td className="hidden pr-4 sm:table-cell">{cityOf(x.segId)}</td>
                <td className="pr-4 font-medium">
                  {x.name}
                  <span className="block text-xs font-normal text-neutral-500 sm:hidden">{cityOf(x.segId)} · {x.status}</span>
                </td>
                <td className="hidden pr-4 text-neutral-500 sm:table-cell">{x.platform}</td>
                <td className="pr-4 whitespace-nowrap">{x.ppn} {x.cur} <span className="hidden text-xs text-neutral-500 sm:inline">({fmt(toBase(x.ppn, x.cur, s.rates))})</span></td>
                <td className="hidden whitespace-nowrap pr-4 text-xs text-neutral-500 sm:table-cell">
                  {x.cancelUntil && <span>free-cancel {x.cancelUntil}</span>}
                  {x.cancelUntil && x.chargeDate && ' · '}
                  {x.chargeDate && <span>charged {x.chargeDate}</span>}
                </td>
                <td className="hidden pr-4 sm:table-cell">{x.status}</td>
                <td className="whitespace-nowrap">
                  <button onClick={() => setModal({ stay: x })} className="text-xs text-teal-600 hover:underline">edit</button>
                  <button onClick={() => del(x.id)} className="ml-3 text-xs text-red-600 hover:underline"><span className="sm:hidden" aria-label="delete">✕</span><span className="hidden sm:inline">delete</span></button>
                </td>
              </tr>
            ))}
            {!s.stays.length && <tr><td colSpan={8} className="py-3 text-neutral-500">No accommodation options yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {modal && (
        <StayForm
          initial={modal.stay}
          segments={s.segments}
          currencies={currencies}
          cities={cities.data ?? []}
          defaultArrive={s.meta.startDate || ''}
          onCreateStop={createStop}
          onCancel={() => setModal(null)}
          onSave={upsert}
        />
      )}
    </main>
  )
}
