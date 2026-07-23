'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchTrip, fetchTrips, isRevConflict, setSelectedTripId } from '@/lib/trips/queries'
import { tk } from '@/lib/trips/keys'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { useTripScope } from '@/lib/trips/TripScope'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'
import { OnboardingWizard } from '@/components/trips/OnboardingWizard'
import { Modal } from '@/components/trips/Modal'

const input = 'mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900'

// The active-trip switcher card (approved endframe: design/mocks/09-settings.html,
// "Active trip" card). Selection is per ACCOUNT (profiles.active_trip_id,
// migration 07) so phone and laptop always show the same trip; on a pre-07 DB
// persisting fails silently and the switch is per-device for the session.
function ActiveTripCard() {
  const sb = createClient()
  const router = useRouter()
  const { tripId, setTripId } = useTripScope()
  const trips = useQuery({ queryKey: tk.trips, queryFn: () => fetchTrips(sb) })
  const switchMut = useMutation({
    mutationFn: async (id: string) => {
      await setSelectedTripId(sb, id).catch(() => {}) // pre-07 DB: local-only switch
      return id
    },
    onSuccess: (id) => {
      setTripId(id)
      // The nav (incl. the Live tab gate) is rendered by the SERVER layout from
      // the active trip — without a refresh it stays stale until a hard reload.
      router.refresh()
    },
  })
  // "New trip" launches the same onboarding wizard (mock 09 note) in a modal.
  const [wizardOpen, setWizardOpen] = useState(false)
  const list = trips.data ?? []
  return (
    <section className="mt-8">
      <h2 className="mb-1 text-lg font-semibold">Active trip</h2>
      <p className="mb-3 text-sm text-neutral-500">All screens are scoped to the active trip.</p>
      <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {list.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
            <span aria-hidden>🧭</span>
            <div className="min-w-0 grow">
              <div className="truncate text-sm font-medium">{t.name}</div>
              <div className="text-xs text-neutral-500">updated {new Date(t.updated_at).toLocaleDateString()}</div>
            </div>
            {t.id === tripId ? (
              <span className="rounded-full bg-teal-600/10 px-2 py-0.5 text-xs font-medium text-teal-700 dark:text-teal-400">Active ✓</span>
            ) : (
              <button
                onClick={() => switchMut.mutate(t.id)}
                disabled={switchMut.isPending}
                className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                Switch
              </button>
            )}
          </li>
        ))}
        {trips.isPending && <li className="px-3 py-2.5 text-sm text-neutral-500">Loading trips…</li>}
      </ul>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={() => setWizardOpen(true)}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          ＋ New trip
        </button>
        <span className="text-xs text-neutral-500">launches the onboarding wizard</span>
      </div>
      {wizardOpen && (
        <Modal title="New trip" onClose={() => setWizardOpen(false)}>
          <OnboardingWizard onDone={() => setWizardOpen(false)} />
        </Modal>
      )}
    </section>
  )
}

export default function SettingsClient() {
  const sb = createClient()
  const { tripId } = useTripScope()
  const trip = useQuery({
    queryKey: tk.trip(tripId ?? 'none'),
    queryFn: () => fetchTrip(sb, tripId!),
    enabled: tripId !== null,
  })
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
    // Legacy/hand-seeded trips can lack meta entirely — keep the form on its
    // defaults instead of crashing the whole screen.
    const m = trip.data.state?.meta
    if (!m) return
    setName(m.tripName)
    setTravelers(m.travelers)
    setBudgetCap(m.budgetCap)
    setStartDate(m.startDate)
    setBaseCurrency(m.baseCurrency)
    setRates(trip.data.state.rates)
  }, [trip.data])

  if (tripId === null) return <CreateTripEmptyState />
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
        {mut.isError && (
          <span className="text-sm text-red-600">
            {isRevConflict(mut.error)
              ? 'Someone else saved this trip first — the latest version was loaded. Please redo your edit.'
              : 'Save failed — try again.'}
          </span>
        )}
      </div>

      <ActiveTripCard />
    </main>
  )
}
