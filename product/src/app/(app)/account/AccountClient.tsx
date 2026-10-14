'use client'
import { useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { tripQueryOptions } from '@/lib/trips/tripQuery'
import {
  createShareLink,
  fetchShares,
  fetchShareStats,
  revokeShare,
  rotateShareLink,
  setShareLinkPaused,
  setTripSharingPaused,
} from '@/lib/trips/shares'
import { tk } from '@/lib/trips/keys'
import { fetchFollowerAccess, fetchMyFollowerCount, fetchMyFollowing, setFollowerAccess } from '@/lib/follow/follows'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useTripScope } from '@/lib/trips/TripScope'
import { useTripRole } from '@/lib/trips/useTripRole'
import { useSetTrackSpending, useTrackSpending } from '@/lib/trips/useTrackSpending'
import { AccountDeletion } from '@/components/trips/DangerZone'
import { Modal } from '@/components/trips/Modal'
import { NotificationSettings } from '@/components/trips/NotificationSettings'
import { SaveError } from '@/components/trips/SaveError'
import { Toggle } from '@/components/trips/sheetKit'
import { useToast } from '@/components/Toast'
import { useHomeBase, useSetHomeBase } from '@/lib/trips/useHomeBase'
import { applyLarger, applyTheme, storedLarger, storedTheme, type Theme } from '@/lib/theme'
import { ActiveTripCard } from '@/app/(app)/settings/ActiveTripCard'
import { Group, Row, RowInput, RowLink, rowCls } from '@/components/ui/SettingsList'

// Account, since round 5b in the phone's groups (AccountView.swift, the split
// Patrik agreed on 29 Sep): how you sign in, the journey's settings behind one
// row, then what belongs to you on every journey ("You": Track spending, your
// name and home, Appearance), People, Alerts, Follow links, Sign out, and
// last the deletion. Each field saves as it is left (decision 5). The web
// keeps what the phone has not built (your name and home, Your trips, People,
// Alerts, Follow links, the password page); the plan says they stay here.
//
// App-level, deliberately NOT trip-scoped (design/mocks/13-account.html): it
// renders with a live trip, with zero trips, mid-onboarding, and right after
// access to the active trip was revoked.

// LIVHOLD v1 token idioms (frames 27/27b/28/29), for the Follow links panel
const input =
  'mt-[5px] w-full rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 py-3 text-base focus:border-ac focus:outline-none disabled:opacity-60'
const pill = 'rounded-full border-[1.4px] border-ln3 px-3 py-1.5 text-base font-medium text-tx2 disabled:opacity-50'
const pillMauve = 'rounded-full border-[1.4px] border-ac2-line px-3 py-1.5 text-base font-medium text-ac2 disabled:opacity-50'

// useSyncExternalStore mounted-gate helpers — module-level so their
// identities are stable (DashboardClient pattern).
const subscribeNever = () => () => {}
const snapTrue = () => true
const snapFalse = () => false
// "now", read through the store so render stays pure (react-hooks/purity):
// '' on the server and during hydration, the real clock right after.
const snapNowIso = () => new Date().toISOString()
const snapNoTime = () => ''

/** The "You" group: what is true of you on every journey. */
function YouGroup({ initialFirstName }: { initialFirstName: string }) {
  const sb = createClient()
  const toast = useToast()
  const router = useRouter()
  // Whether Money tracks what you spend: the person's answer (migration 41), here
  // as on the phone since round 5b (it sat on Trip settings from 4a).
  const track = useTrackSpending()
  const setTrack = useSetTrackSpending()
  // Your first name lives in auth user metadata, not on any trip: it follows
  // the person (the Home avatar, and anywhere the app talks to you).
  const [savedName, setSavedName] = useState(initialFirstName)
  const saveName = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await sb.auth.updateUser({ data: { first_name: name } })
      if (error) throw error
      return name
    },
    onSuccess: async (saved) => {
      setSavedName(saved)
      // The Home avatar reads first_name from the server-side JWT claims, which
      // stay stale until the access token refreshes (~1h). Mint a fresh token
      // with the updated user_metadata now, then re-render the server components.
      await sb.auth.refreshSession()
      router.refresh()
      toast('Saved · Name')
    },
  })
  // Home (#58; Patrik, 27 Sep; migration 43): where you live is a fact about
  // you, not any one journey. Every journey starts and ends there on Trip; a
  // journey created before this, or by someone who never set one, falls back
  // to the home it was created with. Emptying it goes back to that.
  const home = useHomeBase()
  const saveHome = useSetHomeBase()
  // Appearance (frame 27b + P6): the theme and the larger-text choice the
  // personalisation flow offers. Applies instantly via lib/theme (lv-theme /
  // lv-larger in localStorage, data-theme / data-large on <html>); nothing is
  // written to the trip. localStorage doesn't exist during the server
  // prerender and hydration must match it, so the stored choice is read only
  // once mounted; picks then live in local state on top of it.
  const mounted = useSyncExternalStore(subscribeNever, snapTrue, snapFalse)
  const [pick, setPick] = useState<{ theme: Theme; larger: boolean } | null>(null)
  const theme: Theme | null = pick ? pick.theme : mounted ? storedTheme() : null
  const larger = pick ? pick.larger : mounted ? storedLarger() : false

  return (
    <>
      <Group
        title="You"
        footer={
          saveName.isError ? <span className="text-warn">Could not save your name. Try again.</span>
            : saveHome.isError ? <span className="text-warn">Could not save your home. Try again.</span>
              : track.data === 'no' ? 'Spending isn’t tracked on your journeys; Money shows the bookings. Your name is on your Home avatar; every journey starts and ends at your home.'
                : 'Tracking shows your daily pace, where it goes and the projection on Money, on every journey. Your name is on your Home avatar; every journey starts and ends at your home.'
        }
      >
        {track.data && track.data !== 'unknown' && (
          <Row label="Track spending">
            <Toggle on={track.data === 'yes'} onChange={(on) => setTrack.mutate(on)} label="Track spending" />
          </Row>
        )}
        <RowInput label="Name" ariaLabel="First name" value={savedName} placeholder="Anna"
          onSave={(v) => { const t = v.trim(); if (t) saveName.mutate(t) }} />
        <RowInput label="Home" ariaLabel="Home" value={home.data ?? ''} placeholder="City, country" disabled={home.isPending}
          onSave={(v) => saveHome.mutate(v.trim(), { onSuccess: () => toast('Saved · Home') })} />
        <Row label="Appearance">
          <span role="radiogroup" aria-label="Appearance" className="flex rounded-[9px] bg-fill p-[3px]">
            {(['Light', 'Dark', 'System'] as Theme[]).map((t) => {
              const on = theme === t
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => { setPick({ theme: t, larger }); applyTheme(t) }}
                  className={'rounded-[7px] px-2.5 py-1 text-[14px] font-medium ' + (on ? 'bg-sf text-tx shadow-sm' : 'text-tx2')}
                >
                  {t}
                </button>
              )
            })}
          </span>
        </Row>
        <Row label="Larger text">
          <Toggle on={larger} onChange={(on) => { setPick({ theme: theme ?? storedTheme(), larger: on }); applyLarger(on) }} label="Larger text" />
        </Row>
      </Group>
      <SaveError show={setTrack.isError} error={setTrack.error} />
    </>
  )
}

// Follow-links panel (frame 28), relocated from Trip Settings (testing round 1
// designer decision — sharing sits with the person doing the sharing). Create
// (label + optional expiry, default trip end + 30 days), list with follower
// counts, per-link pause/resume, revoke, pause-all switch, and the privacy
// line. Tokens are hashed at rest, so the link is copyable ONCE at creation —
// a per-row Copy can't exist (plan requirement).
export function SharingCard({ endDate }: { endDate?: string }) {
  const sb = createClient()
  const qc = useQueryClient()
  const toast = useToast()
  const { tripId } = useTripScope()
  const nowIso = useSyncExternalStore(subscribeNever, snapNowIso, snapNoTime)
  const shares = useQuery({
    queryKey: tk.shares(tripId ?? 'none'),
    queryFn: () => (tripId ? fetchShares(sb, tripId) : Promise.resolve([])),
  })
  const stats = useQuery({
    queryKey: ['share-stats', tripId ?? 'none'],
    queryFn: () => (tripId ? fetchShareStats(sb, tripId) : Promise.resolve([])),
    refetchInterval: 60_000, // counts drift as family opts in
  })
  // Followers with accounts (migration 33): how many follow you, and whether
  // THIS trip is open to them. Both fail soft on a database without 33.
  const followerCount = useQuery({
    queryKey: ['follower-count'],
    queryFn: () => fetchMyFollowerCount(sb),
    staleTime: 5 * 60_000,
    retry: false,
  })
  const access = useQuery({
    queryKey: ['follower-access', tripId ?? 'none'],
    queryFn: () => fetchFollowerAccess(sb, tripId!),
    enabled: tripId !== null,
    retry: false,
  })
  const accessMut = useMutation({
    mutationFn: (open: boolean) => setFollowerAccess(sb, tripId!, open ? 'on' : 'off'),
    onSuccess: (_d, open) => toast(open ? 'Your followers can see this trip' : 'This trip is hidden from your followers'),
    onSettled: () => qc.invalidateQueries({ queryKey: ['follower-access', tripId ?? 'none'] }),
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
    onError: () => setLinkErr('Could not update that link. Try again.'),
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
  // Rotate (migration 36): the leaked-link tool. Same row, new URL — every
  // opt-in keyed by share_id survives, every copy of the old URL dies. The
  // new link shows once, in the same modal a fresh link uses.
  const [rotated, setRotated] = useState(false)
  const rotate = useMutation({
    mutationFn: (id: string) => rotateShareLink(sb, id),
    onSuccess: (token) => {
      setNewLink(`${window.location.origin}/follow/${token}`)
      setCopied(false)
      setRotated(true)
      setCreateOpen(true)
      setConfirmFor(null)
      toast('Link rotated. The old URL stopped working')
      qc.invalidateQueries({ queryKey: tk.shares(tripId ?? 'none') })
    },
    onError: () => setLinkErr('Could not rotate that link. Try again.'),
  })
  // Revoke and rotate both destroy URLs people hold, so both confirm inline
  // with the cost spelled out from the per-link counts (issue #12).
  const [confirmFor, setConfirmFor] = useState<{ id: string; action: 'revoke' | 'rotate' } | null>(null)

  function openCreate() {
    setLabel('Family')
    setExpiry(defaultExpiry())
    setNewLink(null)
    setCopied(false)
    setRotated(false)
    setCreateOpen(true)
  }
  // "3 devices with push and 2 email digests" — the cost, from the per-link counts.
  const holders = (id: string) => {
    const st = statFor(id)
    if (!st) return 'the people on this link'
    return `${st.push} device${st.push === 1 ? '' : 's'} with push and ${st.email} email digest${st.email === 1 ? '' : 's'}`
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

      {/* The honest description of what a follow link IS. It cannot be made
          account-protected without becoming a different feature — so the card
          says so plainly and points at the one that already is. */}
      <p className="text-base leading-normal text-tx2">
        A follow link opens for <b className="font-semibold text-tx">anyone who has it</b>. There
        is no sign-in, so a forwarded link works just as well for whoever receives it. Followers see
        the route, dates and check-ins; never money, bookings or notes. To share with a specific
        person instead, invite them as a <b className="font-semibold text-tx">Viewer</b> under People
        on this trip in Trip settings. They have to sign in with that address, and the invite
        cannot be passed on.
      </p>

      {/* people who follow YOU (accounts, not links) and this trip's switch */}
      {access.data !== undefined && (
        <div className="rounded-[var(--r)] bg-sf p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 grow">
              <div className="text-base font-semibold">
                {followerCount.data === 1 ? '1 person follows you' : `${followerCount.data ?? 0} people follow you`}
              </div>
              <div className="mt-0.5 text-base leading-normal text-tx2">
                {access.data === 'off'
                  ? 'This trip is not shown to them. New trips start hidden; open it when you are ready.'
                  : access.data === 'paused'
                    ? 'This trip is paused for them, together with the links below.'
                    : 'This trip is open to them: they see the same route, check-ins and notes a link shows.'}
              </div>
            </div>
            <button
              onClick={() => accessMut.mutate(access.data === 'off')}
              disabled={accessMut.isPending || access.data === 'paused'}
              className={access.data === 'off' ? 'rounded-[calc(var(--r)-3px)] bg-ac px-3.5 py-2.5 text-base font-semibold text-on disabled:opacity-50' : pill}
            >
              {accessMut.isPending ? '…' : access.data === 'off' ? 'Open to followers' : 'Hide'}
            </button>
          </div>
        </div>
      )}

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
          Anyone with the link sees your route, dates, last check-in city and shared comments:{' '}
          <b className="font-semibold text-ac2-deep">never money, private notes or exact GPS</b>.
        </p>
        {list.map((s, i) => {
          // An expired link has nothing left to rotate: the new URL would be
          // just as dead (migration 39 refuses it). Revoke is the only tool.
          const expired = !!s.expires_at && !!nowIso && +new Date(s.expires_at) <= +new Date(nowIso)
          return (
          <div key={s.id} className={'flex flex-col gap-2 px-4 py-3.5' + (i > 0 ? ' border-t border-ln' : '')}>
            <div className="min-w-0">
              <div className="truncate text-base font-semibold">
                {s.label || 'Follow link'}
                {expired && <span className="ml-1.5 font-normal text-warn">· Expired</span>}
                {!expired && s.paused_at && <span className="ml-1.5 font-normal text-warn">· Paused</span>}
              </div>
              <div className="text-base text-tx2">
                /follow/{s.token_prefix ?? '??????'}…
                {s.expires_at
                  ? ` · expires ${new Date(s.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : ' · no expiry'}
                {statFor(s.id) && ` · ${statFor(s.id)!.push} push · ${statFor(s.id)!.email} email`}
              </div>
            </div>
            {/* own line: three affordances beside the label would truncate it
                to nothing at 375px wide (PeopleCard's copy-link rule) */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => linkPause.mutate({ id: s.id, paused: !s.paused_at })}
                disabled={linkPause.isPending}
                className={pill + ' flex-none'}
              >
                {s.paused_at ? 'Resume' : 'Pause'}
              </button>
              {!expired && (
                <button
                  onClick={() => setConfirmFor(confirmFor?.id === s.id && confirmFor.action === 'rotate' ? null : { id: s.id, action: 'rotate' })}
                  disabled={rotate.isPending}
                  className={pill + ' flex-none'}
                >
                  Rotate
                </button>
              )}
              <button
                onClick={() => setConfirmFor(confirmFor?.id === s.id && confirmFor.action === 'revoke' ? null : { id: s.id, action: 'revoke' })}
                disabled={revoke.isPending}
                className={pillMauve + ' flex-none'}
              >
                Revoke
              </button>
            </div>
            {confirmFor?.id === s.id && (
              <div className="lv-enter rounded-[14px] bg-warn-soft p-3.5 text-base leading-[1.5]">
                <p className="text-warn">
                  {confirmFor.action === 'revoke'
                    ? `Revoke "${s.label || 'this link'}"? The URL stops working for everyone: ${holders(s.id)} lose their alerts and their access. People who follow you with an account keep following.`
                    : `Rotate "${s.label || 'this link'}"? Every copy of the current URL stops working, saved home-screen icons included. The ${holders(s.id)} on it keep their alerts, but need the new link to open the trip again. You see the new link once, so send it to whoever should keep watching.`}
                </p>
                <div className="mt-2.5 flex gap-2">
                  <button
                    type="button"
                    disabled={revoke.isPending || rotate.isPending}
                    onClick={() => {
                      if (confirmFor.action === 'revoke') {
                        revoke.mutate(s.id, {
                          onSuccess: () => {
                            setConfirmFor(null)
                            toast(`${s.label || 'Follow'} link revoked - that URL stops working`)
                          },
                        })
                      } else {
                        rotate.mutate(s.id)
                      }
                    }}
                    className="rounded-full border-[1.4px] border-warn-line px-3.5 py-1.5 text-base font-semibold text-warn disabled:opacity-50"
                  >
                    {revoke.isPending || rotate.isPending ? '…' : confirmFor.action === 'revoke' ? 'Revoke link' : 'Rotate link'}
                  </button>
                  <button type="button" onClick={() => setConfirmFor(null)} className={pill}>
                    Keep
                  </button>
                </div>
              </div>
            )}
          </div>
          )
        })}
        {linkErr && <p className="border-t border-ln px-4 py-3.5 text-base text-ac2">{linkErr}</p>}
        {!shares.isPending && !list.length && (
          <p className="px-4 py-3.5 text-base text-tx2">
            No follow links yet. Create one and send it to your family.
          </p>
        )}
        {shares.isPending && <p className="px-4 py-3.5 text-base text-tx2">Loading…</p>}
      </div>

      {createOpen && (
        <Modal title={newLink ? (rotated ? 'Link rotated' : 'Follow link created') : 'Create follow link'} onClose={() => setCreateOpen(false)}>
          {!newLink ? (
            <div>
              <p className="mb-3 text-base leading-normal text-tx2">
                For family who just want to watch along: anyone the link reaches can open it. If it
                should only work for one named person, invite them as a Viewer in Trip settings
                instead.
              </p>
              <label className="block text-base font-medium text-tx2">
                Label
                <input className={input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Family" autoFocus />
              </label>
              <label className="mt-3 block text-base font-medium text-tx2">
                Expires <span className="text-tx3">(optional, default trip end + 30 days)</span>
                <input type="date" className={input} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
              </label>
              {create.isError && <p className="mt-2 text-base text-ac2">Could not create the link. Try again.</p>}
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
                {rotated
                  ? <>The old URL is dead. Copy this one now and send it to the people who should keep watching. It is shown <strong>only this once</strong>.</>
                  : <>Copy it now. For security the full link is shown <strong>only this once</strong>. If you lose it, rotate the link for a new one.</>}
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
  // Follow links belong to the ACTIVE trip; its name sits on the Trip settings
  // row and its end date is SharingCard's default expiry. Cached under the same
  // key every trip screen uses, so this is usually free, and `enabled` keeps
  // this page rendering with zero trips, mid-onboarding, or after access was
  // revoked.
  const trip = useQuery({ ...tripQueryOptions(sb, tripId), enabled: tripId !== null })
  const tripName = trip.data?.state?.meta?.tripName || trip.data?.name || ''

  async function signOut() {
    setBusy(true)
    await sb.auth.signOut().catch(() => {})
    qc.clear()
    // Full reload rather than a router push: every cache in memory belongs to
    // the session we just ended.
    window.location.href = '/login'
  }

  return (
    <main className="lv-enter mx-auto flex max-w-xl flex-col gap-4 px-4 pb-6 pt-[10px]">
      <div>
        {/* A way back that does not depend on the tab bar: without a journey there is no
            bar (AppNav), and Account is the one page a follower reaches from Home's avatar. */}
        <Link href="/dashboard" className="-ml-1.5 inline-flex min-h-11 items-center text-base font-semibold text-ac2-deep">
          <ChevronLeft aria-hidden className="size-5" />Home
        </Link>
        <h1 className="font-serif text-[25px] font-semibold leading-[1.15] tracking-[-.01em]">Account</h1>
      </div>

      <Group>
        <Row label="Signed in as"><span className="truncate">{email || 'Signed in'}</span></Row>
        <RowLink label="Sign-in methods" href="/account/sign-in" value="magic link, password" />
      </Group>

      {tripId !== null && (
        <Group title="This journey" footer="Name, dates, home, the budget and exchange rates.">
          <RowLink label="Trip settings" href="/settings" value={tripName} />
        </Group>
      )}

      {/* The switcher (frame 29): per ACCOUNT, so phone and laptop show the same journey. */}
      <ActiveTripCard />

      <YouGroup initialFirstName={initialFirstName ?? ''} />

      <PeopleGroup />

      {/* The notification matrix (issue #13). Here and not on Settings: it
          is about the person, and a follower without a trip needs it too. */}
      <div id="alerts" className="scroll-mt-4">
        <NotificationSettings />
      </div>

      {/* Editors, not just the owner — create_share_link and
          set_trip_sharing_paused both gate on can_edit_trip (migrations 11/16),
          so hiding this from a co-editor would be the UI inventing a rule the
          database doesn't have. Viewers (and trip-less accounts) get nothing. */}
      {tripId !== null && canEdit && <SharingCard endDate={trip.data?.state?.meta?.endDate} />}

      <Group footer="Signs out this browser only. Your other devices stay signed in.">
        <button type="button" onClick={signOut} disabled={busy} className={rowCls + ' w-full text-left font-medium text-ac2-deep disabled:opacity-50'}>
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </Group>

      <AccountDeletion />
    </main>
  )
}

// One row, the door to the full lists. Counts fail soft on a database
// without migration 33 — the row then simply says who it is about.
function PeopleGroup() {
  const sb = createClient()
  const following = useQuery({ queryKey: tk.following, queryFn: () => fetchMyFollowing(sb), staleTime: 5 * 60_000, retry: false })
  const followers = useQuery({ queryKey: ['follower-count'], queryFn: () => fetchMyFollowerCount(sb), staleTime: 5 * 60_000, retry: false })
  const parts = [
    following.data ? `following ${following.data.length}` : null,
    followers.data != null ? `${followers.data} follower${followers.data === 1 ? '' : 's'}` : null,
  ].filter(Boolean)
  return (
    <Group footer="Who you follow, who follows you.">
      <RowLink label="People" href="/people" value={parts.join(' · ')} />
    </Group>
  )
}
