'use client'
import { useState, useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchTrip } from '@/lib/trips/queries'
import {
  createShareLink,
  fetchShares,
  fetchShareStats,
  revokeShare,
  setShareLinkPaused,
  setTripSharingPaused,
} from '@/lib/trips/shares'
import { tk } from '@/lib/trips/keys'
import { useTripScope } from '@/lib/trips/TripScope'
import { useTripRole } from '@/lib/trips/useTripRole'
import { AccountDeletion } from '@/components/trips/DangerZone'
import { Modal } from '@/components/trips/Modal'
import { useToast } from '@/components/Toast'
import { applyLarger, applyTheme, storedLarger, storedTheme, type Theme } from '@/lib/theme'
import { ActiveTripCard } from '@/app/(app)/settings/ActiveTripCard'

// LIVHOLD v1 token idioms (frames 27/27b/28/29)
const input =
  'mt-[5px] w-full rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 py-3 text-base focus:border-ac focus:outline-none disabled:opacity-60'
const pill = 'rounded-full border-[1.4px] border-ln3 px-3 py-1.5 text-base font-medium text-tx2 disabled:opacity-50'
const pillMauve = 'rounded-full border-[1.4px] border-ac2-line px-3 py-1.5 text-base font-medium text-ac2 disabled:opacity-50'

// useSyncExternalStore mounted-gate helpers — module-level so their
// identities are stable (DashboardClient pattern).
const subscribeNever = () => () => {}
const snapTrue = () => true
const snapFalse = () => false

// "Your name" — the first name lives in auth user metadata, not on any trip:
// it follows the person (Home avatar, and eventually anywhere the app talks
// about you) across every trip they own or joined.
function NameCard({ initialFirstName }: { initialFirstName: string }) {
  const sb = createClient()
  const toast = useToast()
  const [name, setName] = useState(initialFirstName)
  // what the server currently has — the prop goes stale after a save until the
  // next server render, so the Save button tracks this instead
  const [savedName, setSavedName] = useState(initialFirstName)

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await sb.auth.updateUser({ data: { first_name: name.trim() } })
      if (error) throw error
      return name.trim()
    },
    onSuccess: (saved) => {
      setSavedName(saved)
      toast('Name saved')
    },
  })

  return (
    <section className="rounded-[var(--r)] bg-sf p-4">
      <h2 className="font-serif text-[19px] font-semibold">Your name</h2>
      <p className="mt-1 text-base leading-normal text-tx2">
        Shown on your Home avatar and to people you plan with.
      </p>
      <div className="mt-2 flex items-end gap-[9px]">
        <label className="block min-w-0 grow text-base font-medium text-tx2">
          First name
          <input
            className={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Anna"
          />
        </label>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending || !name.trim() || name.trim() === savedName.trim()}
          className="flex-none rounded-[calc(var(--r)-3px)] bg-ac px-[15px] py-3 text-base font-semibold text-on disabled:opacity-50"
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
      {save.isError && (
        <p className="mt-2 text-base text-ac2">Could not save your name — try again.</p>
      )}
    </section>
  )
}

// Appearance (frame 27b + P6): the same theme + larger-text choices the
// personalisation flow offers — P7's recap links here, and the README rule is
// that every personalisation answer lives in Settings. Applies instantly via
// the shared lib/theme helpers (lv-theme / lv-larger localStorage +
// data-theme / data-large on <html>); nothing is written to the trip.
// Relocated from Trip Settings (testing round 1): it belongs to the person.
function AppearanceCard() {
  // localStorage doesn't exist during the server prerender and hydration must
  // match it, so the stored choice is read only once mounted (the
  // useSyncExternalStore mounted-gate pattern from DashboardClient); picks
  // then live in local state on top of it.
  const mounted = useSyncExternalStore(subscribeNever, snapTrue, snapFalse)
  const [pick, setPick] = useState<{ theme: Theme; larger: boolean } | null>(null)
  const theme: Theme | null = pick ? pick.theme : mounted ? storedTheme() : null
  const larger = pick ? pick.larger : mounted ? storedLarger() : false

  return (
    <section className="mt-3 flex flex-col gap-3">
      <h2 className="font-serif text-[19px] font-semibold">Appearance</h2>
      <div className="flex flex-col gap-3 rounded-[var(--r)] bg-sf p-4">
        <div className="grid grid-cols-3 gap-2.5">
          {(['Light', 'Dark', 'System'] as Theme[]).map((t) => {
            const on = theme === t
            return (
              <button
                key={on ? t + ' ·picked' : t}
                onClick={() => {
                  setPick({ theme: t, larger })
                  applyTheme(t) // instant — the whole app flips with the pick
                }}
                className={'rounded-[calc(var(--r)-3px)] border-2 bg-sf p-2.5 transition-colors duration-[180ms] ' + (on ? 'lv-pick border-ac' : 'border-fill2')}
              >
                <span
                  className="block h-[74px] rounded-[9px] p-2"
                  style={{
                    background:
                      t === 'Light' ? '#E8F7EE' : t === 'Dark' ? '#161A18' : 'linear-gradient(115deg,#E8F7EE 50%,#161A18 50%)',
                  }}
                >
                  <span className="block h-2 w-[70%] rounded" style={{ background: t === 'Dark' ? '#1F2622' : '#fff' }} />
                  <span className="mt-1.5 block h-[22px] rounded" style={{ background: t === 'Dark' ? '#1F2622' : '#fff' }} />
                  <span className="mt-1.5 block h-2 w-[45%] rounded" style={{ background: t === 'Dark' ? '#7FA37D' : '#3F5A3E' }} />
                </span>
                <span className="mt-[9px] block text-center text-base font-semibold text-tx">{t}</span>
              </button>
            )
          })}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-ln pt-3">
          <span>
            <span className="block text-base font-semibold">Larger text</span>
            <span className="block text-base text-tx2">Every size steps up one notch</span>
          </span>
          <button
            role="switch"
            aria-checked={larger}
            aria-label="Larger text"
            onClick={() => {
              setPick({ theme: theme ?? storedTheme(), larger: !larger })
              applyLarger(!larger)
            }}
            className={'relative h-[31px] w-[52px] flex-none rounded-full transition-colors duration-[180ms] ' + (larger ? 'bg-ac' : 'bg-ln2')}
          >
            <span
              className={'absolute top-[3px] block h-[25px] w-[25px] rounded-full bg-sf transition-[left] duration-[180ms] ' + (larger ? 'left-[24px]' : 'left-[3px]')}
            />
          </button>
        </div>
      </div>
    </section>
  )
}

// Follow-links panel (frame 28), relocated from Trip Settings (testing round 1
// designer decision — sharing sits with the person doing the sharing). Create
// (label + optional expiry, default trip end + 30 days), list with follower
// counts, per-link pause/resume, revoke, pause-all switch, and the privacy
// line. Tokens are hashed at rest, so the link is copyable ONCE at creation —
// a per-row Copy can't exist (plan requirement).
function SharingCard({ endDate }: { endDate?: string }) {
  const sb = createClient()
  const qc = useQueryClient()
  const toast = useToast()
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
    onSuccess: (_d, paused) =>
      toast(paused ? 'Sharing paused - push and digests are muted' : 'Sharing resumed'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: tk.shares(tripId ?? 'none') })
      qc.invalidateQueries({ queryKey: ['share-stats', tripId ?? 'none'] })
    },
  })
  // Per-link pause (testing round 1): paused_at on the single row, so one
  // noisy link can go quiet while the others keep flowing.
  const [linkErr, setLinkErr] = useState<string | null>(null)
  const linkPause = useMutation({
    mutationFn: ({ id, paused }: { id: string; paused: boolean }) =>
      setShareLinkPaused(sb, id, paused),
    onSuccess: (_d, { paused }) => {
      setLinkErr(null)
      toast(paused ? 'Link paused - that URL shows the paused page' : 'Link resumed')
    },
    onError: () => setLinkErr('Could not update that link — try again.'),
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
      toast('New follow link created')
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

  return (
    <section className="mt-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 className="font-serif text-[19px] font-semibold">Follow links</h2>
        <button onClick={openCreate} className="rounded-[calc(var(--r)-3px)] bg-ac px-3.5 py-2.5 text-base font-semibold text-on">
          ＋ Create
        </button>
      </div>

      {/* always-visible follower count + pause-all */}
      {list.length > 0 && (
        <div
          className={
            allPaused
              ? 'rounded-[var(--r)] border-[1.5px] border-warn-line bg-warn-soft p-4'
              : 'rounded-[var(--r)] bg-sf p-4'
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 grow">
              <div className={'text-base font-semibold' + (allPaused ? ' text-warn' : '')}>
                {allPaused ? 'Sharing is paused' : 'Sharing is live'}
              </div>
              <div className="mt-0.5 text-base leading-normal text-tx2">
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
                  ? 'rounded-[calc(var(--r)-3px)] bg-ac px-3.5 py-2.5 text-base font-semibold text-on disabled:opacity-50'
                  : pill
              }
            >
              {pauseMut.isPending ? '…' : allPaused ? 'Resume' : 'Pause'}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-[var(--r)] bg-sf">
        <p className="border-b border-ln px-4 pb-3.5 pt-4 text-base leading-normal text-tx2">
          Anyone with the link sees your route, dates, last check-in city and shared comments —{' '}
          <b className="font-semibold text-ac2-deep">never money, private notes or exact GPS</b>.
        </p>
        {list.map((s, i) => (
          <div key={s.id} className={'flex flex-col gap-2 px-4 py-3.5' + (i > 0 ? ' border-t border-ln' : '')}>
            <div className="min-w-0">
              <div className="truncate text-base font-semibold">
                {s.label || 'Follow link'}
                {s.paused_at && <span className="ml-1.5 font-normal text-warn">· Paused</span>}
              </div>
              <div className="text-base text-tx2">
                /follow/{s.token_prefix ?? '??????'}…
                {s.expires_at ? ` · expires ${new Date(s.expires_at).toLocaleDateString()}` : ' · no expiry'}
                {statFor(s.id) && ` · ${statFor(s.id)!.push} push · ${statFor(s.id)!.email} email`}
              </div>
            </div>
            {/* own line: three affordances beside the label would truncate it
                to nothing at 375px wide (PeopleCard's copy-link rule) */}
            <div className="flex gap-2">
              <button
                onClick={() => linkPause.mutate({ id: s.id, paused: !s.paused_at })}
                disabled={linkPause.isPending}
                className={pill + ' flex-none'}
              >
                {s.paused_at ? 'Resume' : 'Pause'}
              </button>
              <button
                onClick={() => {
                  if (confirm(`Revoke "${s.label || 'this link'}"? Followers using it lose access immediately.`))
                    revoke.mutate(s.id, {
                      onSuccess: () =>
                        toast(`${s.label || 'Follow'} link revoked - that URL stops working`),
                    })
                }}
                disabled={revoke.isPending}
                className={pillMauve + ' flex-none'}
              >
                Revoke
              </button>
            </div>
          </div>
        ))}
        {linkErr && <p className="border-t border-ln px-4 py-3.5 text-base text-ac2">{linkErr}</p>}
        {!shares.isPending && !list.length && (
          <p className="px-4 py-3.5 text-base text-tx2">
            No follow links yet — create one and send it to your family.
          </p>
        )}
        {shares.isPending && <p className="px-4 py-3.5 text-base text-tx2">Loading…</p>}
      </div>

      {createOpen && (
        <Modal title={newLink ? 'Follow link created' : 'Create follow link'} onClose={() => setCreateOpen(false)}>
          {!newLink ? (
            <div>
              <label className="block text-base font-medium text-tx2">
                Label
                <input className={input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Family" autoFocus />
              </label>
              <label className="mt-3 block text-base font-medium text-tx2">
                Expires <span className="text-tx3">— optional, default trip end + 30 days</span>
                <input type="date" className={input} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
              </label>
              {create.isError && <p className="mt-2 text-base text-ac2">Could not create the link — try again.</p>}
              <button
                onClick={() => create.mutate()}
                disabled={create.isPending || !tripId}
                className="mt-4 w-full rounded-[calc(var(--r)-2px)] bg-ac py-3.5 text-base font-semibold text-on disabled:opacity-50"
              >
                {create.isPending ? 'Creating…' : 'Create link'}
              </button>
            </div>
          ) : (
            <div>
              <p className="text-base leading-normal text-tx2">
                Copy it now — for security the full link is shown <strong>only this once</strong>. If you lose it, revoke and create a new one.
              </p>
              <div className="mt-3 break-all rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp p-3 font-mono text-base">
                {newLink}
              </div>
              <div className="mt-3 flex gap-2.5">
                <button onClick={copy} className="rounded-[calc(var(--r)-3px)] bg-ac px-3.5 py-2.5 text-base font-semibold text-on">
                  {copied ? '✓ Copied' : '⧉ Copy link'}
                </button>
                <button onClick={() => setCreateOpen(false)} className="rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln3 px-3.5 py-2.5 text-base font-semibold text-tx2">
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

// LIVHOLD v1 frame 29.
//
// Identity (with sign out), Your name, Your trips (active / switch / ＋ New
// trip — the account-level list frame 29 places here rather than on the
// trip-scoped Settings), Appearance and Follow links (relocated from Trip
// Settings — they belong to the person, testing round 1), and the account
// danger zone. Deletion (29b/c) arms only on the exact phrase DELETE MY
// ACCOUNT and lands on /goodbye.
export default function AccountClient({
  email,
  initialFirstName,
}: {
  email: string
  initialFirstName?: string
}) {
  const sb = createClient()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const { tripId } = useTripScope()
  const { canEdit } = useTripRole()
  // Follow links belong to the ACTIVE trip; only its end date is needed here
  // (SharingCard's default expiry). Cached under the same key every trip
  // screen uses, so this is usually free — and `enabled` keeps this page
  // rendering with zero trips, mid-onboarding, or after access was revoked.
  const trip = useQuery({
    queryKey: tk.trip(tripId ?? 'none'),
    queryFn: () => fetchTrip(sb, tripId!),
    enabled: tripId !== null,
  })

  async function signOut() {
    setBusy(true)
    await sb.auth.signOut().catch(() => {})
    qc.clear()
    // Full reload rather than a router push: every cache in memory belongs to
    // the session we just ended.
    window.location.href = '/login'
  }

  return (
    <main className="lv-enter mx-auto flex max-w-xl flex-col gap-3 px-[18px] pb-6 pt-[18px]">
      <div>
        <h1 className="font-serif text-[25px] font-semibold">Account</h1>
        <p className="mt-[5px] text-base leading-normal text-tx2">
          These apply to you, not to any one trip.
        </p>
      </div>

      <section className="rounded-[var(--r)] bg-sf p-4">
        <h2 className="font-serif text-[19px] font-semibold">Signed in as</h2>
        <div className="mt-3 flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-10 flex-none items-center justify-center rounded-full border-[1.5px] border-ac2-line bg-ac2-soft text-base font-semibold text-ac2-deep"
          >
            {((initialFirstName?.trim() || email.trim())[0] ?? '?').toUpperCase()}
          </span>
          <div className="min-w-0 grow">
            <div className="truncate text-base font-semibold">{email || 'Signed in'}</div>
            <div className="mt-0.5 text-base text-tx2">
              Magic-link sign-in — no password to manage.
            </div>
          </div>
        </div>
        <button
          onClick={signOut}
          disabled={busy}
          className="mt-[13px] w-full rounded-[calc(var(--r)-3px)] border-[1.5px] border-ac2 py-3 text-base font-semibold text-ac2 disabled:opacity-50"
        >
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </section>

      <NameCard initialFirstName={initialFirstName ?? ''} />

      <ActiveTripCard />

      <AppearanceCard />

      {/* Editors, not just the owner — create_share_link and
          set_trip_sharing_paused both gate on can_edit_trip (migrations 11/16),
          so hiding this from a co-editor would be the UI inventing a rule the
          database doesn't have. Viewers (and trip-less accounts) get nothing. */}
      {tripId !== null && canEdit && <SharingCard endDate={trip.data?.state?.meta?.endDate} />}

      <AccountDeletion />
    </main>
  )
}
