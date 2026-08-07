'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useOnline } from '@/lib/useOnline'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchTrip, isRevConflict, isPermissionDenied, createInvite } from '@/lib/trips/queries'
import { fetchSentInvites, revokeInvite } from '@/lib/trips/invites'
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
import { DangerZone } from '@/components/trips/DangerZone'
import { NotificationSettings } from '@/components/trips/NotificationSettings'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'
import { Modal } from '@/components/trips/Modal'
import { ActiveTripCard } from './ActiveTripCard'

// LIVHOLD v1 token idioms (frames 27/27b/28)
const input =
  'mt-[5px] w-full rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 py-3 text-base focus:border-ac focus:outline-none disabled:opacity-60'
const pill = 'rounded-full border-[1.4px] border-ln3 px-3 py-1.5 text-base font-medium text-tx2 disabled:opacity-50'
const pillMauve = 'rounded-full border-[1.4px] border-ac2-line px-3 py-1.5 text-base font-medium text-ac2 disabled:opacity-50'
const pillAc = 'rounded-full border-[1.4px] border-ac-line px-3 py-1.5 text-base font-medium text-ac disabled:opacity-50'

// "People on this trip" — the INVITER's half of the invite flow (migration 25).
//
// Until now the only way to invite anyone was step 3 of the onboarding wizard,
// which hardcoded 'editor'. That made the viewer role unreachable through the
// app entirely: you could not invite a viewer, and nobody could accept
// anything. This card is where an existing trip gains people.
//
// Editors, not just the owner: invites_insert gates on can_edit_trip.
function PeopleCard() {
  const sb = createClient()
  const qc = useQueryClient()
  const { tripId } = useTripScope()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'editor' | 'viewer'>('editor')
  // which pending row just had its link copied — reverts after the same 1.5s
  // beat the follow-link modal uses
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const sent = useQuery({
    queryKey: tk.sentInvites(tripId ?? 'none'),
    queryFn: () => (tripId ? fetchSentInvites(sb, tripId) : Promise.resolve([])),
  })
  const invite = useMutation({
    mutationFn: () => createInvite(sb, tripId!, email, role),
    onSuccess: () => {
      setEmail('')
      qc.invalidateQueries({ queryKey: tk.sentInvites(tripId ?? 'none') })
    },
  })
  const revoke = useMutation({
    mutationFn: (id: string) => revokeInvite(sb, id),
    onSettled: () => qc.invalidateQueries({ queryKey: tk.sentInvites(tripId ?? 'none') }),
  })

  const pending = sent.data ?? []
  const valid = /.+@.+\..+/.test(email.trim())

  // There is no email sender — this link IS the delivery path (migration 28's
  // /invite/[token] front door). Invite tokens are stored in plain, unlike
  // hashed share tokens, so copying works on every visit, not just at creation.
  async function copyLink(id: string, token: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/invite/${token}`)
    setCopiedId(id)
    setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500)
  }

  return (
    <section className="mt-3 flex flex-col gap-3">
      <h2 className="font-serif text-[19px] font-semibold">People on this trip</h2>
      <div className="flex flex-col gap-[11px] rounded-[var(--r)] bg-sf p-4">
        <p className="text-base leading-normal text-tx2">
          Invite by email, then copy their link below and send it yourself —{' '}
          <b className="font-semibold text-tx">nothing is emailed automatically</b>. Signing in
          with that address also shows the invite in-app.
        </p>

        <div className="flex items-end gap-[9px]">
          <label className="block min-w-0 grow text-base font-medium text-tx2">
            Email
            <input
              type="email"
              className={input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="partner@example.com"
            />
          </label>
          <label className="block w-[118px] flex-none text-base font-medium text-tx2">
            Can
            <select className={input} value={role} onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')}>
              <option value="editor">Edit</option>
              <option value="viewer">View</option>
            </select>
          </label>
        </div>
        <button
          onClick={() => invite.mutate()}
          disabled={!valid || invite.isPending}
          className="rounded-[calc(var(--r)-3px)] bg-ac px-[15px] py-3 text-base font-semibold text-on disabled:opacity-50"
        >
          {invite.isPending ? 'Inviting…' : 'Send invite'}
        </button>
        {invite.isError && (
          <p className="text-base text-ac2">Could not create the invite — try again.</p>
        )}

        {pending.map((i) => (
          <div key={i.id} className="flex flex-col gap-2 border-t border-ln pt-3">
            <div className="flex items-center gap-[11px]">
              <div className="min-w-0 grow">
                <div className="truncate text-base font-semibold">{i.email}</div>
                <div className="text-base text-tx2">
                  invited as {i.role === 'editor' ? 'co-editor' : 'viewer'} · not accepted yet
                </div>
              </div>
              <button onClick={() => revoke.mutate(i.id)} disabled={revoke.isPending} className={pill + ' flex-none'}>
                Withdraw
              </button>
            </div>
            {/* own line: beside Withdraw the email would truncate to ~110px at 375px wide */}
            <button onClick={() => copyLink(i.id, i.token)} className={pillAc + ' self-start'}>
              {copiedId === i.id ? '✓ Copied' : '⧉ Copy invite link'}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

// Follow-links panel (frame 28). Create (label + optional expiry, default trip
// end + 30 days), list with follower counts, revoke, pause-all switch, and the
// privacy line. Tokens are hashed at rest, so the link is copyable ONCE at
// creation — a per-row Copy can't exist (plan requirement).
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
          <div key={s.id} className={'flex items-center gap-[9px] px-4 py-3.5' + (i > 0 ? ' border-t border-ln' : '')}>
            <div className="min-w-0 grow">
              <div className="truncate text-base font-semibold">
                {s.label || 'Follow link'}
                {s.paused_at && <span className="ml-1.5 font-normal text-warn">· paused</span>}
              </div>
              <div className="text-base text-tx2">
                /follow/{s.token_prefix ?? '??????'}…
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
              className={pillMauve + ' flex-none'}
            >
              Revoke
            </button>
          </div>
        ))}
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
  if (trip.isPending)
    return <main className="mx-auto max-w-xl px-[18px] pt-[18px] text-base text-tx2">Loading…</main>
  if (!trip.data)
    // The scoped trip vanished mid-session (deleted, or access revoked). The
    // generic no-access screen points HERE to recover, so this page must keep
    // the switcher usable rather than bouncing to that same screen.
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-3 px-[18px] pb-6 pt-[18px]">
        <h1 className="font-serif text-[25px] font-semibold">Trip settings</h1>
        <div className="rounded-[var(--r)] border-[1.5px] border-warn-line bg-warn-soft p-4 text-base leading-normal text-tx2">
          <span className="font-semibold text-warn">You no longer have access to the selected trip.</span>{' '}
          It may have been deleted, or your invite was withdrawn. Switch to another trip below,
          or start your own.
        </div>
        <ActiveTripCard />
      </main>
    )

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
    <main className="lv-enter mx-auto flex max-w-xl flex-col gap-3 px-[18px] pb-6 pt-[18px]">
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Back to the Trip screen (frame 27's back-arrow circle). */}
        <Link
          href="/itinerary"
          aria-label="Back to Trip"
          className="flex size-11 flex-none items-center justify-center rounded-full border-[1.5px] border-ln2 bg-sf"
        >
          <ArrowLeft aria-hidden className="size-5" strokeWidth={2} />
        </Link>
        <h1 className="font-serif text-[25px] font-semibold">Trip settings</h1>
        {/* Your standing on this trip. Shown to everyone, not just viewers: on a
            shared trip "who am I here" is worth stating even when the answer is
            Owner — it's the anchor the read-only states refer back to. */}
        {role !== 'unknown' && role !== 'none' && (
          <span className="rounded-full border-[1.4px] border-ln3 px-2.5 py-[3px] text-base font-medium text-tx2">
            {roleLabel(role)}
          </span>
        )}
      </div>
      <p className="text-base leading-normal text-tx2">
        Trip basics and the FX rates used to total everything in {baseCurrency}.
      </p>

      <ViewerNotice />

      <div className="flex flex-col gap-3 rounded-[var(--r)] bg-sf p-4">
        <label className="block text-base font-medium text-tx2">
          Trip name
          <input className={input} disabled={!canEdit} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="flex gap-2.5">
          <label className="block flex-1 text-base font-medium text-tx2">
            Travellers
            <input type="number" min={1} className={input} disabled={!canEdit} value={travelers} onChange={(e) => setTravelers(Number(e.target.value) || 1)} />
          </label>
          <label className="block flex-1 text-base font-medium text-tx2">
            Start date
            <input type="date" className={input} disabled={!canEdit} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
        </div>
        <div className="flex gap-2.5">
          <label className="block flex-1 text-base font-medium text-tx2">
            Budget cap
            <input type="number" min={0} className={input} disabled={!canEdit} value={budgetCap} onChange={(e) => setBudgetCap(Number(e.target.value) || 0)} />
          </label>
          <label className="block w-[110px] flex-none text-base font-medium text-tx2">
            Base
            <select className={input} disabled={!canEdit} value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)}>
              {curList.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
      </div>

      <FxPanel state={trip.data.state} fx={fx.data} online={online} canEdit={canEdit} />

      {canEdit && (
        <div className="flex flex-col gap-2">
          <button
            onClick={save}
            disabled={mut.isPending}
            className="w-full rounded-[calc(var(--r)-2px)] bg-ac py-3.5 text-[17px] font-semibold text-on disabled:opacity-50"
          >
            {mut.isPending ? 'Saving…' : 'Save changes'}
          </button>
          {saved && <span className="text-center text-base font-medium text-tx2">✓ Saved</span>}
          {mut.isError && (
            <span className="text-base text-ac2">
              {isPermissionDenied(mut.error)
                ? 'Your edit access to this trip was removed — the change was rolled back.'
                : isRevConflict(mut.error)
                  ? 'Someone else saved this trip first — the latest version was loaded. Please redo your edit.'
                  : 'Save failed — try again.'}
            </span>
          )}
        </div>
      )}

      {/* Personal (account-level), so every role sees it — a viewer partner
          still wants the deadline buzz. Frame 27b. */}
      <NotificationSettings />

      {/* Editors, not just the owner — create_share_link and
          set_trip_sharing_paused both gate on can_edit_trip (migrations 11/16),
          so hiding this from a co-editor would be the UI inventing a rule the
          database doesn't have. Viewers get nothing. */}
      {canEdit && <PeopleCard />}
      {canEdit && <SharingCard endDate={trip.data.state?.meta?.endDate} />}

      {/* Last on the page, per frame 28 — irreversible actions never sit above
          the things people came here to do. Viewers see it too: leaving a trip
          is the one destructive action a viewer legitimately has. */}
      <DangerZone tripName={trip.data.state?.meta?.tripName ?? name} />

      <p className="mt-4 text-center text-base text-tx3">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
        <img src="/brand/livhold-mark.png" alt="Livhold" width={18} height={18} className="inline-block align-[-0.25em]" />{' '}
        build v{process.env.NEXT_PUBLIC_BUILD_SHA} · updates apply automatically
      </p>
    </main>
  )
}
