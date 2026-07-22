'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { createTrip, setSelectedTripId } from '@/lib/trips/queries'
import { tk } from '@/lib/trips/keys'
import { useTripScope } from '@/lib/trips/TripScope'

export default function CreateTripEmptyState() {
  const sb = createClient()
  const qc = useQueryClient()
  const { setTripId } = useTripScope()
  const m = useMutation({
    mutationFn: () => createTrip(sb),
    onSuccess: async (trip) => {
      qc.setQueryData(tk.trip(trip.id), trip)
      qc.invalidateQueries({ queryKey: tk.trips })
      // Persist the selection per account (migration 07). On a pre-07 DB the
      // column doesn't exist — swallow the error; scope still switches locally.
      await setSelectedTripId(sb, trip.id).catch(() => {})
      setTripId(trip.id)
    },
  })
  return (
    <main className="mx-auto max-w-2xl p-6 text-center">
      <h1 className="mb-2 text-2xl font-semibold">No trip yet</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Start with the sample Asia route — you can edit everything afterwards.
      </p>
      <button
        onClick={() => m.mutate()}
        disabled={m.isPending}
        className="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {m.isPending ? 'Creating…' : 'Create my trip'}
      </button>
      {m.isError && <p className="mt-3 text-sm text-red-600">Could not create trip. Try again.</p>}
    </main>
  )
}
