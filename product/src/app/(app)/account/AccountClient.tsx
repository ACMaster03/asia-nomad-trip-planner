'use client'
import { useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { humanAuthError } from '@/lib/auth/authError'
import { fetchTrip } from '@/lib/trips/queries'
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
import { ChevronRight } from 'lucide-react'
import { useTripScope } from '@/lib/trips/TripScope'
import { useTripRole } from '@/lib/trips/useTripRole'
import { AccountDeletion } from '@/components/trips/DangerZone'
import { Modal } from '@/components/trips/Modal'
import { NotificationSettings } from '@/components/trips/NotificationSettings'
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
// "now", read through the store so render stays pure (react-hooks/purity):
// '' on the server and during hydration, the real clock right after.
const snapNowIso = () => new Date().toISOString()
const snapNoTime = () => ''

// "Your name" — the first name lives in auth user metadata, not on any trip:
// it follows the person (Home avatar, and eventually anywhere the app talks
// about you) across every trip they own or joined.
function NameCard({ initialFirstName }: { initialFirstName: string }) {
  const sb = createClient()
  const toast = useToast()
  const router = useRouter()
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
    onSuccess: async (saved) => {
      setSavedName(saved)
      // The Home avatar reads first_name from the server-side JWT claims, which
      // stay stale until the access token refreshes (~1h). Mint a fresh token
      // with the updated user_metadata now, then re-render the server components.
      await sb.auth.refreshSession()
      router.refresh()
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

// Password (2026-09-14). Accounts here arrive by invitation and sign in with a
// magic link; a password is a SECOND key to a door you already have, never a way
// to make a new account — this app has no sign-up anywhere, and the Supabase
// project keeps signups closed.
//
// Two reasons it exists. Google Play requires reusable sign-in credentials for
// app review, and says so in as many words for apps gated behind one-time
// passwords — which is exactly what a magic link is. And on the road it is the
// more dependable way in: no mail server to wait on, and no link that can be
// opened in the wrong browser (the failure lib/supabase/otp.ts documents).
//
// Whether an account already HAS a password is not something Supabase tells the
// client — there is no flag on the user object — so this card never claims to
// know. It sets one either way, which is also what makes it double as the
// landing spot for a "forgot password" link.
const MIN_PASSWORD_LENGTH = 8

function PasswordCard() {
  const sb = createClient()
  const toast = useToast()
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')

  const tooShort = pw.length > 0 && pw.length < MIN_PASSWORD_LENGTH
  const mismatch = confirm.length > 0 && pw !== confirm
  const ready = pw.length >= MIN_PASSWORD_LENGTH && pw === confirm

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await sb.auth.updateUser({ password: pw })
      if (error) throw error
    },
    onSuccess: () => {
      setPw('')
      setConfirm('')
      setError('')
      toast('Password saved - you can sign in with it now')
    },
    onError: (e) =>
      setError(
        humanAuthError(e, "We couldn't save the password just now. Please try again in a moment."),
      ),
  })

  return (
    <section className="rounded-[var(--r)] bg-sf p-4">
      <h2 className="font-serif text-[19px] font-semibold">Password</h2>
      <p className="mt-1 text-base leading-normal text-tx2">
        Optional. A magic link always works — a password is a second way in, and the quicker one
        when the mail is slow to arrive. Set a new one here at any time.
      </p>
      <label className="mt-2 block text-base font-medium text-tx2">
        New password
        <input
          className={input}
          type="password"
          autoComplete="new-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder={'At least ' + MIN_PASSWORD_LENGTH + ' characters'}
        />
      </label>
      <label className="mt-3 block text-base font-medium text-tx2">
        Confirm password
        <input
          className={input}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Type it again"
        />
      </label>
      {/* Both notes wait for the reader to have typed something — a form that
          scolds you before you have finished the first field is just noise. */}
      {tooShort && (
        <p className="mt-2 text-base text-tx2">
          At least {MIN_PASSWORD_LENGTH} characters.
        </p>
      )}
      {mismatch && <p className="mt-2 text-base text-ac2">The two passwords don&apos;t match.</p>}
      {error && <p className="mt-2 text-base text-ac2">{error}</p>}
      <button
        onClick={() => save.mutate()}
        disabled={save.isPending || !ready}
        className="mt-[13px] w-full rounded-[calc(var(--r)-3px)] bg-ac py-3 text-base font-semibold text-on disabled:opacity-50"
      >
        {save.isPending ? 'Saving…' : 'Save password'}
      </button>
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
      toast('Link rotated — the old URL stopped working')
      qc.invalidateQueries({ queryKey: tk.shares(tripId ?? 'none') })
    },
    onError: () => setLinkErr('Could not rotate that link — try again.'),
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
        A follow link opens for <b className="font-semibold text-tx">anyone who has it</b> — there
        is no sign-in, so a forwarded link works just as well for whoever receives it. Followers see
        the route, dates and check-ins; never money, bookings or notes. To share with a specific
        person instead, invite them as a <b className="font-semibold text-tx">Viewer</b> under People
        on this trip in Trip settings — they have to sign in with that address, and the invite
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
          Anyone with the link sees your route, dates, last check-in city and shared comments —{' '}
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
                    : `Rotate "${s.label || 'this link'}"? Every copy of the current URL stops working, saved home-screen icons included. The ${holders(s.id)} on it keep their alerts, but need the new link to open the trip again. You see the new link once — send it to whoever should keep watching.`}
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
            No follow links yet — create one and send it to your family.
          </p>
        )}
        {shares.isPending && <p className="px-4 py-3.5 text-base text-tx2">Loading…</p>}
      </div>

      {createOpen && (
        <Modal title={newLink ? (rotated ? 'Link rotated' : 'Follow link created') : 'Create follow link'} onClose={() => setCreateOpen(false)}>
          {!newLink ? (
            <div>
              <p className="mb-3 text-base leading-normal text-tx2">
                For family who just want to watch along — anyone the link reaches can open it. If it
                should only work for one named person, invite them as a Viewer in Trip settings
                instead.
              </p>
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
                {rotated
                  ? <>The old URL is dead. Copy this one now — it is shown <strong>only this once</strong> — and send it to the people who should keep watching.</>
                  : <>Copy it now — for security the full link is shown <strong>only this once</strong>. If you lose it, rotate the link for a new one.</>}
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
              Sign in with a magic link, or with a password you set below.
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

      {/* Directly under the identity card, and above everything trip-shaped: a
          "forgot password" link lands on this page, so what it came for has to
          be on screen without hunting. */}
      <PasswordCard />

      <NameCard initialFirstName={initialFirstName ?? ''} />

      <ActiveTripCard />

      <PeopleRow />

      {/* The notification matrix (issue #13). Here and not on Settings: it
          is about the person, and a follower without a trip needs it too. */}
      <div id="alerts" className="scroll-mt-4">
        <NotificationSettings />
      </div>

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

// One line, the door to the full lists. Counts fail soft on a database
// without migration 33 — the row then simply says "People".
function PeopleRow() {
  const sb = createClient()
  const following = useQuery({ queryKey: tk.following, queryFn: () => fetchMyFollowing(sb), staleTime: 5 * 60_000, retry: false })
  const followers = useQuery({ queryKey: ['follower-count'], queryFn: () => fetchMyFollowerCount(sb), staleTime: 5 * 60_000, retry: false })
  const parts = [
    following.data ? `Following ${following.data.length}` : null,
    followers.data != null ? `${followers.data} follower${followers.data === 1 ? '' : 's'}` : null,
  ].filter(Boolean)
  return (
    <Link href="/people" className="flex items-center justify-between rounded-[var(--r)] bg-sf p-4">
      <span>
        <span className="block font-serif text-[19px] font-semibold">People</span>
        <span className="block text-base text-tx2">{parts.length ? parts.join(' · ') : 'Who you follow, who follows you'}</span>
      </span>
      <ChevronRight aria-hidden className="size-5 text-ac2" />
    </Link>
  )
}
