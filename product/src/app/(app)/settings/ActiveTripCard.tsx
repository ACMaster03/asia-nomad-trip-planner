'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchTrips, setSelectedTripId } from '@/lib/trips/queries'
import { tk } from '@/lib/trips/keys'
import { useTripScope } from '@/lib/trips/TripScope'
import { OnboardingWizard } from '@/components/trips/OnboardingWizard'
import { Modal } from '@/components/trips/Modal'

// The "Your trips" switcher card (LIVHOLD v1 frame 29). Selection is per
// ACCOUNT (profiles.active_trip_id, migration 07) so phone and laptop always
// show the same trip; if persisting fails (offline), the switch still applies
// per-device for the session. Lives on /account per frame 29; the Settings
// no-access fallback also renders it as the recovery path when the scoped
// trip vanishes mid-session.
export function ActiveTripCard() {
  const sb = createClient()
  const router = useRouter()
  const { tripId, setTripId } = useTripScope()
  const trips = useQuery({ queryKey: tk.trips, queryFn: () => fetchTrips(sb) })
  const switchMut = useMutation({
    mutationFn: async (id: string) => {
      await setSelectedTripId(sb, id).catch(() => {}) // best-effort — offline keeps a local-only switch
      return id
    },
    onSuccess: (id) => {
      setTripId(id)
      // The nav (incl. the Live tab gate) is rendered by the SERVER layout from
      // the active trip — without a refresh it stays stale until a hard reload.
      router.refresh()
    },
  })
  // "New trip" launches the same onboarding wizard in a modal.
  const [wizardOpen, setWizardOpen] = useState(false)
  const list = trips.data ?? []
  return (
    <section className="mt-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 className="font-serif text-[19px] font-semibold">Your trips</h2>
        <button
          onClick={() => setWizardOpen(true)}
          className="rounded-[calc(var(--r)-3px)] bg-ac px-3.5 py-2.5 text-base font-semibold text-on"
        >
          ＋ New trip
        </button>
      </div>
      <div className="rounded-[var(--r)] bg-sf px-4 py-0.5">
        {list.map((t, i) => (
          <div
            key={t.id}
            className={'flex items-center gap-3 py-3.5' + (i < list.length - 1 || trips.isPending ? ' border-b border-ln' : '')}
          >
            <div className="min-w-0 grow">
              <div className="truncate text-base font-semibold">{t.name}</div>
              <div className="text-base text-tx2">updated {new Date(t.updated_at).toLocaleDateString()}</div>
            </div>
            {t.id === tripId ? (
              <span className="rounded-full border-[1.4px] border-ac bg-ac-soft px-3 py-1.5 text-base font-medium text-tx2">
                Active ✓
              </span>
            ) : (
              <button
                onClick={() => switchMut.mutate(t.id)}
                disabled={switchMut.isPending}
                className="rounded-full border-[1.4px] border-ln3 px-3 py-1.5 text-base font-medium text-tx2 disabled:opacity-50"
              >
                Switch
              </button>
            )}
          </div>
        ))}
        {trips.isPending && <div className="py-3.5 text-base text-tx2">Loading trips…</div>}
      </div>
      {wizardOpen && (
        <Modal title="New trip" onClose={() => setWizardOpen(false)}>
          <OnboardingWizard onDone={() => setWizardOpen(false)} />
        </Modal>
      )}
    </section>
  )
}
