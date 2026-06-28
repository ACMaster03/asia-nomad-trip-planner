'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { createTrip } from '@/lib/trips/queries'
import { tk } from '@/lib/trips/keys'

export default function CreateTripEmptyState() {
  const sb = createClient()
  const qc = useQueryClient()
  const m = useMutation({
    mutationFn: () => createTrip(sb),
    onSuccess: (trip) => {
      qc.setQueryData(tk.activeTrip, trip)
      qc.invalidateQueries({ queryKey: tk.activeTrip })
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
