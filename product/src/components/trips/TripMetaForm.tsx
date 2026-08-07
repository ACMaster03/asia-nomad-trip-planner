'use client'
import { useState } from 'react'
import type { NewTripInput } from '@/lib/trips/newTrip'

// Step 1 of the onboarding wizard — "Trip basics" (endframe: mock 01, wizard
// state). Per mock 09's note this component is the single source of truth for
// these fields + validation; Settings → Trip reuses the same field set.
// Native date inputs on purpose (mock: "Native is fine for M1").

const input =
  'mt-[5px] w-full rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 py-3 text-base font-medium text-tx outline-none transition-colors duration-[180ms] focus:border-ac'
const label = 'block text-base font-medium text-tx2'

const CURRENCIES = ['HUF', 'EUR', 'USD', 'THB', 'VND'] as const

export function TripMetaForm({ onSubmit, busy, submitLabel = 'Create trip →' }: {
  onSubmit: (values: NewTripInput) => void
  busy?: boolean
  submitLabel?: string
}) {
  const [tripName, setTripName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [travelers, setTravelers] = useState(2)
  const [budgetCap, setBudgetCap] = useState<string>('')
  const [baseCurrency, setBaseCurrency] = useState<string>('HUF')
  const [error, setError] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!tripName.trim()) return setError('Give the trip a name.')
    if (!startDate) return setError('Pick a start date.')
    if (endDate && endDate < startDate) return setError('End date is before the start date.')
    setError(null)
    onSubmit({
      tripName,
      startDate,
      endDate: endDate || undefined,
      travelers,
      budgetCap: budgetCap ? Number(budgetCap) || 0 : 0,
      baseCurrency,
    })
  }

  return (
    <form onSubmit={submit} noValidate>
      <label className={label}>
        Trip name
        <input className={input} value={tripName} onChange={(e) => setTripName(e.target.value)} placeholder="Asia 2026–27" autoFocus />
      </label>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Start date
          <input type="date" className={input} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className={label}>
          End date <span className="text-tx3">— optional</span>
          <input type="date" className={input} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
      </div>
      <p className="mt-1.5 text-base text-tx3">
        Leave the end date off for an open-ended trip — budget pace will use “so far” instead of “per remaining day”.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className={label}>
          Travellers
          <div className="mt-[5px] flex items-center gap-3">
            <button type="button" aria-label="fewer" onClick={() => setTravelers((t) => Math.max(1, t - 1))}
              className="h-11 w-11 rounded-full border-[1.5px] border-ln2 text-lg leading-none text-tx2">−</button>
            <span className="w-6 text-center text-base font-semibold">{travelers}</span>
            <button type="button" aria-label="more" onClick={() => setTravelers((t) => t + 1)}
              className="h-11 w-11 rounded-full border-[1.5px] border-ln2 text-lg leading-none text-tx2">＋</button>
          </div>
          <p className="mt-1.5 text-base text-tx3">You can name them later.</p>
        </div>
        <div className={label}>
          Budget cap <span className="text-tx3">— optional</span>
          <div className="mt-1 flex gap-2">
            <input
              type="number" min={0} className={input + ' mt-0'} value={budgetCap}
              onChange={(e) => setBudgetCap(e.target.value)} placeholder="4 500 000"
            />
            <select
              className="rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-2 py-3 text-base font-medium text-tx"
              value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)}
              aria-label="Budget currency"
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <p className="mt-1.5 text-base text-tx3">Whole-trip cap, all travellers. Also sets the primary display currency.</p>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-[calc(var(--r)-2px)] border border-warn-line bg-warn-soft px-3 py-2 text-base text-warn">{error}</p>
      )}

      <button type="submit" disabled={busy}
        className="mt-4 w-full rounded-[calc(var(--r)-2px)] bg-ac px-4 py-[15px] text-[17px] font-semibold text-on disabled:opacity-50">
        {busy ? 'Creating…' : submitLabel}
      </button>
    </form>
  )
}
