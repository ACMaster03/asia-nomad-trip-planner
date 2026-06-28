'use client'
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchActiveTrip } from '@/lib/trips/queries'
import { tk } from '@/lib/trips/keys'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'

const input = 'mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900'

export default function SettingsClient() {
  const sb = createClient()
  const trip = useQuery({ queryKey: tk.activeTrip, queryFn: () => fetchActiveTrip(sb) })
  const mut = useTripMutation()

  // local draft, synced from the loaded trip; saved on demand (one write, not per keystroke)
  const [name, setName] = useState('')
  const [travelers, setTravelers] = useState(2)
  const [budgetCap, setBudgetCap] = useState(0)
  const [startDate, setStartDate] = useState('')
  const [baseCurrency, setBaseCurrency] = useState('HUF')
  const [rates, setRates] = useState<Record<string, number>>({})
  const [saved, setSaved] = useState(false)
  const loadedVer = useRef<string | null>(null)

  useEffect(() => {
    if (!trip.data) return
    // hydrate the draft only when the server version actually changes — a background
    // refetch (or post-save invalidate) must not overwrite in-progress keystrokes.
    if (loadedVer.current === trip.data.updated_at) return
    loadedVer.current = trip.data.updated_at
    const m = trip.data.state.meta
    setName(m.tripName)
    setTravelers(m.travelers)
    setBudgetCap(m.budgetCap)
    setStartDate(m.startDate)
    setBaseCurrency(m.baseCurrency)
    setRates(trip.data.state.rates)
  }, [trip.data])

  if (trip.isPending) return <main className="mx-auto max-w-3xl p-6">Loading…</main>
  if (!trip.data) return <CreateTripEmptyState />

  function save() {
    mut.mutate(
      (s) => ({
        ...s,
        meta: { ...s.meta, tripName: name, travelers, budgetCap, startDate, baseCurrency },
        rates: { ...rates, HUF: 1 }, // base currency is always 1
      }),
      {
        onSuccess: () => {
          setSaved(true)
          setTimeout(() => setSaved(false), 1500)
        },
      },
    )
  }

  const curList = Object.keys(rates).sort((a, b) => (a === 'HUF' ? -1 : b === 'HUF' ? 1 : a.localeCompare(b)))

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-2xl font-semibold">Settings</h1>
      <p className="mb-4 text-sm text-neutral-500">Trip basics and the FX rates used to total everything in HUF.</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Trip name<input className={input} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="block text-sm">Travellers<input type="number" min={1} className={input} value={travelers} onChange={(e) => setTravelers(Number(e.target.value) || 1)} /></label>
        <label className="block text-sm">Budget cap (Ft)<input type="number" min={0} className={input} value={budgetCap} onChange={(e) => setBudgetCap(Number(e.target.value) || 0)} /></label>
        <label className="block text-sm">Start date<input type="date" className={input} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label className="block text-sm">Base currency
          <select className={input} value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)}>
            {curList.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>

      <h2 className="mb-2 mt-6 text-lg font-semibold">FX rates <span className="text-sm font-normal text-neutral-500">(Ft per 1 unit)</span></h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {curList.map((c) => (
          <label key={c} className="block text-sm">
            {c}
            <input
              type="number"
              step="any"
              className={input}
              value={c === 'HUF' ? 1 : (rates[c] ?? 0)}
              disabled={c === 'HUF'}
              onChange={(e) => setRates({ ...rates, [c]: Number(e.target.value) || 0 })}
            />
          </label>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button onClick={save} disabled={mut.isPending} className="rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {mut.isPending ? 'Saving…' : 'Save changes'}
        </button>
        {saved && <span className="text-sm text-emerald-600">✓ Saved</span>}
        {mut.isError && <span className="text-sm text-red-600">Save failed — try again.</span>}
      </div>
    </main>
  )
}
