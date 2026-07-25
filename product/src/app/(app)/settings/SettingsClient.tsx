'use client'
import { useEffect, useRef, useState } from 'react'
import { useOnline } from '@/lib/useOnline'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchTrip, fetchTrips, isRevConflict, isPermissionDenied, setSelectedTripId } from '@/lib/trips/queries'
import { createShareLink, fetchShares, fetchShareStats, revokeShare, setTripSharingPaused } from '@/lib/trips/shares'
import { tk } from '@/lib/trips/keys'
import FxPanel from '@/components/trips/FxPanel'
import { fetchFx } from '@/lib/catalogue/fx'
import { qk } from '@/lib/catalogue/keys'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { useTripScope } from '@/lib/trips/TripScope'
import { useTripRole } from '@/lib/trips/useTripRole'
import { roleLabel } from '@/lib/trips/role'
import { ViewerNotice } from '@/components/trips/ViewerNotice'
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

// Follow-links panel (approved endframe: design/mocks/09-settings.html,
// "Sharing" state → hero card + Follow links card). Create (label + optional
// expiry, default trip end + 30 days), list with follower counts, revoke,
// pause-all switch, and the privacy grid. Tokens are hashed at rest, so the
// link is copyable ONCE at creation — the mock's per-row Copy can't exist
// (plan requirement).
function SharingCard({ endDate }: { endDate?: string }) {
  const sb = createClient()
  const qc = useQueryClient()
  const { tripId } = useTripScope()
  const shares = useQuery({
    queryKey: tk.shares(tripId ?? 'none'),
    queryFn: () => (tripId ? fetchShares(sb, tripId) : Promise.resolve([])),
  })
  const stats = useQuery({
    queryKey: ['share-stats', tripId ?? 'none'],
    queryFn: () => (tripId ? fetchShareStats(sb, tripId) : Promise.resolve([])),
    refetchInterval: 60_000, // counts drift as family opts in
  })
  const pauseMut = useMutation({
    mutationFn: (paused: boolean) => setTripSharingPaused(sb, tripId!, paused),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: tk.shares(tripId ?? 'none') })
      qc.invalidateQueries({ queryKey: ['share-stats', tripId ?? 'none'] })
    },
  })

  const [createOpen, setCreateOpen] = useState(false)
  const [label, setLabel] = useState('Family')
  const defaultExpiry = () => {
    if (!endDate) return ''
    const d = new Date(endDate + 'T00:00:00')
    d.setDate(d.getDate() + 30)
    return d.toISOString().slice(0, 10)
  }
  const [expiry, setExpiry] = useState<string>('')
  const [newLink, setNewLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const create = useMutation({
    mutationFn: () =>
      createShareLink(sb, tripId!, label.trim(), expiry ? expiry + 'T23:59:59Z' : null),
    onSuccess: (token) => {
      setNewLink(`${window.location.origin}/follow/${token}`)
      qc.invalidateQueries({ queryKey: tk.shares(tripId ?? 'none') })
    },
  })
  const revoke = useMutation({
    mutationFn: (id: string) => revokeShare(sb, id),
    onSettled: () => qc.invalidateQueries({ queryKey: tk.shares(tripId ?? 'none') }),
  })

  function openCreate() {
    setLabel('Family')
    setExpiry(defaultExpiry())
    setNewLink(null)
    setCopied(false)
    setCreateOpen(true)
  }
  async function copy() {
    if (!newLink) return
    await navigator.clipboard.writeText(newLink)
    setCopied(true)
  }

  const list = shares.data ?? []
  const statFor = (id: string) => stats.data?.find((x) => x.share_id === id)
  const totals = (stats.data ?? []).reduce(
    (a, x) => ({ push: a.push + x.push, email: a.email + x.email }),
    { push: 0, email: 0 },
  )
  const allPaused = list.length > 0 && list.every((s) => s.paused_at)
  const inputCls = 'mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900'

  return (
    <section className="mt-8">
      <div className="mb-1 flex items-center gap-3">
        <h2 className="text-lg font-semibold">Follow links</h2>
        <span className="text-xs text-neutral-500">no account needed — sanitized live view</span>
        <button
          onClick={openCreate}
          className="ml-auto rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          ＋ Create follow link
        </button>
      </div>

      {/* mock 09 hero card: always-visible follower count + pause-all */}
      {list.length > 0 && (
        <div
          className={
            allPaused
              ? 'mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30'
              : 'mb-3 rounded-lg border border-teal-200 bg-teal-50/50 p-3 dark:border-teal-900 dark:bg-teal-950/30'
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 grow">
              <div className="text-sm font-medium">
                {allPaused ? '⏸️ Sharing is paused' : '📡 Sharing is live'}
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {allPaused
                  ? 'Followers see a “sharing paused” page; push and email digests are muted. Opt-ins are kept.'
                  : stats.data
                    ? `${totals.push} device${totals.push === 1 ? '' : 's'} get push · ${totals.email} email digest${totals.email === 1 ? '' : 's'}`
                    : 'Loading follower counts…'}
              </div>
            </div>
            <button
              onClick={() => pauseMut.mutate(!allPaused)}
              disabled={pauseMut.isPending}
              className={
                allPaused
                  ? 'rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50'
                  : 'rounded border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-neutral-700'
              }
            >
              {pauseMut.isPending ? '…' : allPaused ? 'Resume sharing' : 'Pause all sharing'}
            </button>
          </div>
        </div>
      )}

      <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {list.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 grow">
              <div className="truncate text-sm font-medium">
                {s.label || 'Follow link'}{' '}
                <span className="font-mono text-xs text-neutral-500">/follow/{s.token_prefix ?? '??????'}…</span>
                {s.paused_at && (
                  <span className="ml-1 rounded-full border border-amber-400 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">paused</span>
                )}
              </div>
              <div className="text-xs text-neutral-500">
                created {new Date(s.created_at).toLocaleDateString()}
                {s.expires_at ? ` · expires ${new Date(s.expires_at).toLocaleDateString()}` : ' · no expiry'}
                {statFor(s.id) && ` · ${statFor(s.id)!.push} push · ${statFor(s.id)!.email} email`}
              </div>
            </div>
            <button
              onClick={() => {
                if (confirm(`Revoke "${s.label || 'this link'}"? Followers using it lose access immediately.`))
                  revoke.mutate(s.id)
              }}
              disabled={revoke.isPending}
              className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950"
            >
              Revoke
            </button>
          </li>
        ))}
        {!shares.isPending && !list.length && (
          <li className="px-3 py-2.5 text-sm text-neutral-500">
            No follow links yet — create one and send it to your family.
          </li>
        )}
        {shares.isPending && <li className="px-3 py-2.5 text-sm text-neutral-500">Loading…</li>}
      </ul>

      <div className="mt-3 grid gap-3 rounded-lg border border-neutral-200 p-3 text-xs sm:grid-cols-2 dark:border-neutral-800">
        <div>
          <div className="mb-1 font-medium text-emerald-600">Followers see</div>
          <ul className="list-inside list-disc space-y-0.5 text-neutral-500">
            <li>Route, cities &amp; dates (day precision)</li>
            <li>Last check-in city + &ldquo;last seen&rdquo; time</li>
            <li>Check-ins, ratings &amp; comments shared to followers</li>
          </ul>
        </div>
        <div>
          <div className="mb-1 font-medium text-red-600">Followers never see</div>
          <ul className="list-inside list-disc space-y-0.5 text-neutral-500">
            <li>Money — budget, ledger, prices</li>
            <li>Private notes &amp; booking references</li>
            <li>Exact GPS / addresses (city-level only)</li>
          </ul>
        </div>
      </div>

      {createOpen && (
        <Modal title={newLink ? 'Follow link created' : 'Create follow link'} onClose={() => setCreateOpen(false)}>
          {!newLink ? (
            <div>
              <label className="block text-sm">
                Label
                <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Family" autoFocus />
              </label>
              <label className="mt-3 block text-sm">
                Expires <span className="text-neutral-400">— optional, default trip end + 30 days</span>
                <input type="date" className={inputCls} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
              </label>
              {create.isError && <p className="mt-2 text-sm text-red-600">Could not create the link — try again.</p>}
              <button
                onClick={() => create.mutate()}
                disabled={create.isPending || !tripId}
                className="mt-4 w-full rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {create.isPending ? 'Creating…' : 'Create link'}
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Copy it now — for security the full link is shown <strong>only this once</strong>. If you lose it, revoke and create a new one.
              </p>
              <div className="mt-3 break-all rounded border border-neutral-200 bg-neutral-50 p-2 font-mono text-xs dark:border-neutral-800 dark:bg-neutral-900">
                {newLink}
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={copy} className="rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white">
                  {copied ? '✓ Copied' : '⧉ Copy link'}
                </button>
                <button onClick={() => setCreateOpen(false)} className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">
                  Done
                </button>
              </div>
            </div>
          )}
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
  // This screen reads the RAW trip document on purpose: FxPanel edits the
  // watchlist itself and derives live values from the snapshot below, so the
  // merged view from useTripScreen would just be a detour.
  const fx = useQuery({ queryKey: qk.fx, queryFn: () => fetchFx(sb), staleTime: 60 * 60_000 })
  const online = useOnline()
  const mut = useTripMutation()
  const { role, canEdit } = useTripRole()

  // local draft, synced from the loaded trip; saved on demand (one write, not per keystroke)
  const [name, setName] = useState('')
  const [travelers, setTravelers] = useState(2)
  const [budgetCap, setBudgetCap] = useState(0)
  const [startDate, setStartDate] = useState('')
  const [baseCurrency, setBaseCurrency] = useState('HUF')
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
  }, [trip.data])

  if (tripId === null) return <CreateTripEmptyState />
  if (trip.isPending) return <main className="mx-auto max-w-3xl p-6">Loading…</main>
  if (!trip.data) return <CreateTripEmptyState />

  function save() {
    mut.mutate(
      (s) => ({
        ...s,
        meta: { ...s.meta, tripName: name, travelers, budgetCap, startDate, baseCurrency },
        // rates deliberately untouched: they are refreshed from fx_rates and
        // the watchlist is edited in FxPanel (migration 19).
      }),
      {
        onSuccess: () => {
          setSaved(true)
          setTimeout(() => setSaved(false), 1500)
        },
      },
    )
  }

  const curList = Object.keys(trip.data.state.rates ?? {}).sort((a, b) => (a === 'HUF' ? -1 : b === 'HUF' ? 1 : a.localeCompare(b)))

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-1 flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Settings</h1>
        {/* Your standing on this trip. Shown to everyone, not just viewers: on a
            shared trip "who am I here" is worth stating even when the answer is
            Owner — it's the anchor the read-only states refer back to. */}
        {role !== 'unknown' && role !== 'none' && (
          <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-xs text-neutral-500 dark:border-neutral-700">
            {roleLabel(role)}
          </span>
        )}
      </div>
      <p className="mb-4 text-sm text-neutral-500">Trip basics and the FX rates used to total everything in {baseCurrency}.</p>

      <ViewerNotice />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Trip name<input className={input} disabled={!canEdit} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="block text-sm">Travellers<input type="number" min={1} className={input} disabled={!canEdit} value={travelers} onChange={(e) => setTravelers(Number(e.target.value) || 1)} /></label>
        <label className="block text-sm">Budget cap ({baseCurrency})<input type="number" min={0} className={input} disabled={!canEdit} value={budgetCap} onChange={(e) => setBudgetCap(Number(e.target.value) || 0)} /></label>
        <label className="block text-sm">Start date<input type="date" className={input} disabled={!canEdit} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label className="block text-sm">Base currency
          <select className={input} disabled={!canEdit} value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)}>
            {curList.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>

      <FxPanel state={trip.data.state} fx={fx.data} online={online} canEdit={canEdit} />

      {canEdit && (
        <div className="mt-6 flex items-center gap-3">
          <button onClick={save} disabled={mut.isPending} className="rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {mut.isPending ? 'Saving…' : 'Save changes'}
          </button>
          {saved && <span className="text-sm text-emerald-600">✓ Saved</span>}
          {mut.isError && (
            <span className="text-sm text-red-600">
              {isPermissionDenied(mut.error)
                ? 'Your edit access to this trip was removed — the change was rolled back.'
                : isRevConflict(mut.error)
                  ? 'Someone else saved this trip first — the latest version was loaded. Please redo your edit.'
                  : 'Save failed — try again.'}
            </span>
          )}
        </div>
      )}

      {/* Editors, not just the owner — create_share_link and
          set_trip_sharing_paused both gate on can_edit_trip (migrations 11/16),
          so hiding this from a co-editor would be the UI inventing a rule the
          database doesn't have. Viewers get nothing. */}
      {canEdit && <SharingCard endDate={trip.data.state?.meta?.endDate} />}
      <ActiveTripCard />
      <p className="mt-10 text-center text-xs text-neutral-400 dark:text-neutral-600">
        🧭 Asia Nomad Planner · build v{process.env.NEXT_PUBLIC_BUILD_SHA} · updates apply automatically
      </p>
    </main>
  )
}
