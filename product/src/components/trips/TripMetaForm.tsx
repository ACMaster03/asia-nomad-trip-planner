'use client'
import { useState } from 'react'
import type { NewTripInput } from '@/lib/trips/newTrip'

// Step 1 of the onboarding wizard — "Trip basics" (endframe: mock 01, wizard
// state). Per mock 09's note this component is the single source of truth for
// these fields + validation; Settings → Trip reuses the same field set.
// Native date inputs on purpose (mock: "Native is fine for M1").

const input = 'mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900'
const label = 'block text-sm'

const CURRENCIES = ['HUF', 'EUR', 'USD', 'THB', 'VND'] as const

export function TripMetaForm({ onSubmit, busy, submitLabel = 'Create trip →' }: {
  onSubmit: (values: NewTripInput) => void
  busy?: boolean
  submitLabel?: string
}) {
  const [tripName, setTripName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [hasEnd, setHasEnd] = useState(false)
  const [endDate, setEndDate] = useState('')
  const [travelers, setTravelers] = useState(2)
  const [budgetCap, setBudgetCap] = useState<string>('')
  const [baseCurrency, setBaseCurrency] = useState<string>('HUF')
  const [error, setError] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!tripName.trim()) return setError('Give the trip a name.')
    if (!startDate) return setError('Pick a start date.')
    if (hasEnd && endDate && endDate < startDate) return setError('End date is before the start date.')
    setError(null)
    onSubmit({
      tripName,
      startDate,
      endDate: hasEnd && endDate ? endDate : undefined,
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
        <div className={label}>
          <span className="flex items-center gap-2">
            End date <span className="text-neutral-400">— optional</span>
            <input
              type="checkbox"
              checked={hasEnd}
              onChange={(e) => setHasEnd(e.target.checked)}
              aria-label="Trip has an end date"
            />
          </span>
          <input type="date" className={input} value={endDate} disabled={!hasEnd} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        Leave the end date off for an open-ended trip — budget pace will use “so far” instead of “per remaining day”.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className={label}>
          Travellers
          <div className="mt-1 flex items-center gap-3">
            <button type="button" aria-label="fewer" onClick={() => setTravelers((t) => Math.max(1, t - 1))}
              className="h-8 w-8 rounded border border-neutral-300 text-lg leading-none dark:border-neutral-700">−</button>
            <span className="w-6 text-center text-sm font-medium">{travelers}</span>
            <button type="button" aria-label="more" onClick={() => setTravelers((t) => t + 1)}
              className="h-8 w-8 rounded border border-neutral-300 text-lg leading-none dark:border-neutral-700">＋</button>
          </div>
          <p className="mt-1 text-xs text-neutral-500">You can name them later.</p>
        </div>
        <div className={label}>
          Budget cap <span className="text-neutral-400">— optional</span>
          <div className="mt-1 flex gap-2">
            <input
              type="number" min={0} className={input + ' mt-0'} value={budgetCap}
              onChange={(e) => setBudgetCap(e.target.value)} placeholder="4 500 000"
            />
            <select
              className="rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)}
              aria-label="Budget currency"
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <p className="mt-1 text-xs text-neutral-500">Whole-trip cap, all travellers. Also sets the primary display currency.</p>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={busy}
        className="mt-4 w-full rounded bg-teal-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
        {busy ? 'Creating…' : submitLabel}
      </button>
    </form>
  )
}
