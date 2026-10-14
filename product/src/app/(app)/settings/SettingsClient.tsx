'use client'
import { useState } from 'react'
import Link from 'next/link'
import { CalendarDays, ChevronLeft, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { tripQueryOptions } from '@/lib/trips/tripQuery'
import { createInvite } from '@/lib/trips/queries'
import { fetchSentInvites, revokeInvite } from '@/lib/trips/invites'
import { tk } from '@/lib/trips/keys'
import { fetchFx, isStale } from '@/lib/catalogue/fx'
import { qk } from '@/lib/catalogue/keys'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { useTripScope } from '@/lib/trips/TripScope'
import { useTripRole } from '@/lib/trips/useTripRole'
import { useHomeBase } from '@/lib/trips/useHomeBase'
import { useMoney } from '@/lib/trips/Money'
import { useSetTrackSpending, useTrackSpending } from '@/lib/trips/useTrackSpending'
import { refreshedText } from '@/lib/trips/fxText'
import { symbolOf } from '@/lib/trips/moneyText'
import { shortDate } from '@/lib/trips/subscriptions'
import { addDays } from '@/lib/trips/spending'
import { useToast } from '@/components/Toast'
import { Toggle } from '@/components/trips/sheetKit'
import { SaveError } from '@/components/trips/SaveError'
import { roleLabel } from '@/lib/trips/role'
import { ViewerNotice } from '@/components/trips/ViewerNotice'
import { DangerZone } from '@/components/trips/DangerZone'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'
import { Group, Row, RowInput, RowLink } from '@/components/ui/SettingsList'
import type { TripMeta } from '@/lib/trips/types'
import { ActiveTripCard } from './ActiveTripCard'

// Trip settings, since round 5 in the phone's look (TripSettings.swift): a
// grouped list, "This journey" (name, starts, ends, travellers, home) and
// "Money" (budget, the currency locked, "Exchange rates ›" to its own page).
// Each field saves when it is left; there is no Save button (decision 5,
// Patrik, 12 Oct). Reached from Trip's gear, Money's ring and Account.
//
// Below the two groups the web keeps what the phone has not built: the Track
// spending switch (here since 4a, Petra; it goes to Account's "You" group with
// 5b), the Alerts row to Account, People on this trip (invites), the danger
// zone and the build number.

// LIVHOLD v1 token idioms (frames 27/27b/28)
const input =
  'mt-[5px] w-full rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 py-3 text-base focus:border-ac focus:outline-none disabled:opacity-60'
const pill = 'rounded-full border-[1.4px] border-ln3 px-3 py-1.5 text-base font-medium text-tx2 disabled:opacity-50'
const pillAc = 'rounded-full border-[1.4px] border-ac-line px-3 py-1.5 text-base font-medium text-ac disabled:opacity-50'

/** "4 500 000" — the budget as the row shows it; nothing for none. */
const capText = (n: number | undefined) => (n && n > 0 ? Math.round(n).toLocaleString('en-US').replace(/,/g, ' ') : '')

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
          Invite by email, then copy their link below and send it yourself:{' '}
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
        {/* The role words matter more than they look: "View" is the answer to
            "share the trip, but only with THIS person" — unlike a follow link,
            an invite is bound to the address and cannot be forwarded. */}
        <p className="text-base leading-normal text-tx2">
          <b className="font-semibold text-tx">Edit</b> can change the plan;{' '}
          <b className="font-semibold text-tx">View</b> sees everything but changes nothing. Either
          way they must sign in with this address, so the invite is useless to anyone else. That is
          the difference from a follow link, which opens for whoever holds it.
        </p>
        {invite.isError && (
          <p className="text-base text-ac2">Could not create the invite. Try again.</p>
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

/** A date on the right of its row: the day as a pill, the phone's own picker under a tap. */
function DateRow({ label, value, onSave, disabled, optional, suggested }: {
  label: string
  value: string
  onSave: (iso: string) => void
  disabled?: boolean
  /** "open-ended" when empty, and a ✕ to clear it */
  optional?: boolean
  /** where the picker opens when there is no date yet */
  suggested?: string
}) {
  return (
    <Row label={label}>
      <label className={'relative inline-flex min-h-9 items-center gap-1.5 rounded-[9px] bg-fill px-3 text-[15px] font-medium text-tx ' + (disabled ? 'opacity-60' : '')}>
        <CalendarDays aria-hidden className="size-4 text-tx2" />
        <span className={value ? '' : 'text-tx2'}>{value ? shortDate(value) + (value.slice(0, 4) !== String(new Date().getFullYear()) ? ` ${value.slice(0, 4)}` : '') : 'open-ended'}</span>
        <input
          aria-label={label}
          type="date"
          disabled={disabled}
          value={value || suggested || ''}
          onChange={(e) => { if (e.target.value) onSave(e.target.value) }}
          onClick={(e) => { try { e.currentTarget.showPicker() } catch { /* the tap still focuses it */ } }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
        />
      </label>
      {optional && value && !disabled && (
        <button type="button" onClick={() => onSave('')} aria-label={`Clear ${label.toLowerCase()}`} className="flex size-8 flex-none items-center justify-center rounded-full bg-fill text-tx2">
          <X aria-hidden className="size-[14px]" strokeWidth={2.6} />
        </button>
      )}
    </Row>
  )
}

export default function SettingsClient() {
  const sb = createClient()
  const { tripId } = useTripScope()
  const trip = useQuery({ ...tripQueryOptions(sb, tripId), enabled: tripId !== null })
  // The RAW trip document on purpose: the rates page edits the watchlist in it,
  // and the merged view from useTripScreen would just be a detour.
  const fx = useQuery({ queryKey: qk.fx, queryFn: () => fetchFx(sb), staleTime: 60 * 60_000 })
  const mut = useTripMutation()
  const { role, canEdit } = useTripRole()
  const { fmt } = useMoney()
  const toast = useToast()
  const profileHome = useHomeBase().data
  // Whether Money tracks what you spend: the person's answer (migration 41),
  // kept here as on the phone (Settings → Money) since round 4a of the redesign.
  const track = useTrackSpending()
  const setTrack = useSetTrackSpending()
  const [dateProblem, setDateProblem] = useState<string | null>(null)

  if (tripId === null) return <CreateTripEmptyState />
  if (trip.isPending)
    return <main className="mx-auto max-w-xl px-4 pt-[18px] text-base text-tx2">Loading…</main>
  if (!trip.data)
    // The scoped trip vanished mid-session (deleted, or access revoked). The
    // generic no-access screen points HERE to recover, so this page must keep
    // the switcher usable rather than bouncing to that same screen.
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-3 px-4 pb-6 pt-[18px]">
        <h1 className="font-serif text-[25px] font-semibold">Trip settings</h1>
        <div className="rounded-[var(--r)] border-[1.5px] border-warn-line bg-warn-soft p-4 text-base leading-normal text-tx2">
          <span className="font-semibold text-warn">You no longer have access to the selected trip.</span>{' '}
          It may have been deleted, or your invite was withdrawn. Switch to another trip below,
          or start your own.
        </div>
        <ActiveTripCard />
      </main>
    )

  // Legacy/hand-seeded trips can lack meta entirely; the rows then show nothing and save a fresh one.
  const meta: Partial<TripMeta> = trip.data.state?.meta ?? {}
  const base = meta.baseCurrency || 'HUF'
  const symbol = symbolOf(fmt)

  /** One change to the journey's meta; everything else is kept. */
  function patch(p: Partial<TripMeta>, what: string) {
    mut.mutate((s) => ({ ...s, meta: { ...s.meta, ...p } }), { onSuccess: () => toast(`Saved · ${what}`) })
  }
  function saveStart(iso: string) {
    if (meta.endDate && meta.endDate < iso) { setDateProblem('The end is before the start.'); return }
    setDateProblem(null)
    patch({ startDate: iso }, 'Starts')
  }
  function saveEnd(iso: string) {
    if (iso && meta.startDate && iso < meta.startDate) { setDateProblem('The end is before the start.'); return }
    setDateProblem(null)
    patch({ endDate: iso || undefined }, 'Ends')
  }

  return (
    <main className="lv-enter mx-auto flex max-w-xl flex-col gap-4 px-4 pb-6 pt-[10px]">
      <div>
        <Link href="/itinerary" className="-ml-1.5 inline-flex min-h-11 items-center text-base font-semibold text-ac2-deep">
          <ChevronLeft aria-hidden className="size-5" />Trip
        </Link>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-serif text-[25px] font-semibold leading-[1.15] tracking-[-.01em]">Trip settings</h1>
          {/* Your standing on this trip. Shown to everyone, not just viewers: on a
              shared trip "who am I here" is worth stating even when the answer is
              Owner — it's the anchor the read-only states refer back to. */}
          {role !== 'unknown' && role !== 'none' && (
            <span className="rounded-full border-[1.4px] border-ln3 px-2.5 py-[3px] text-[14px] font-medium text-tx2">
              {roleLabel(role)}
            </span>
          )}
        </div>
      </div>

      <ViewerNotice />
      <SaveError show={mut.isError} error={mut.error} />

      <Group
        title="This journey"
        footer={
          dateProblem ? <span className="text-warn">{dateProblem}</span>
            : !canEdit ? 'Only the journey’s editors can change these.'
              : profileHome ? `Your own home, ${profileHome}, comes first; it is set under Account.`
                : 'Each field saves as you leave it.'
        }
      >
        <RowInput label="Name" ariaLabel="Name" value={meta.tripName ?? ''} placeholder="Name" disabled={!canEdit}
          onSave={(v) => { const t = v.trim(); if (t) patch({ tripName: t }, 'Name') }} />
        <DateRow label="Starts" value={meta.startDate ?? ''} onSave={saveStart} disabled={!canEdit} />
        <DateRow label="Ends" value={meta.endDate ?? ''} onSave={saveEnd} disabled={!canEdit} optional suggested={meta.startDate ? addDays(meta.startDate, 30) : undefined} />
        <RowInput label="Travellers" ariaLabel="Travellers" value={String(meta.travelers ?? 1)} inputMode="numeric" disabled={!canEdit}
          onSave={(v) => patch({ travelers: Math.max(1, Math.round(Number(v)) || 1) }, 'Travellers')} />
        <RowInput label="Home" ariaLabel="Home" value={meta.homeBase ?? ''} placeholder="City, country" disabled={!canEdit}
          onSave={(v) => patch({ homeBase: v.trim() || undefined }, 'Home')} />
      </Group>

      <Group title="Money" footer="Rates refresh every morning. The currency can change once each expense keeps the rate of its own day.">
        <RowInput label="Budget" ariaLabel="Budget" value={capText(meta.budgetCap)} placeholder="None" suffix={symbol} inputMode="numeric" disabled={!canEdit}
          onSave={(v) => patch({ budgetCap: Number(v.replace(/\D/g, '')) || 0 }, 'Budget')} />
        {/* Locked until each expense keeps its own day's rate (#129): changing
            it today would reprice the past at today's rate. */}
        <Row label={<span className="opacity-45">Currency</span>}>
          <span className="opacity-45" title="Can’t be changed yet">{base}</span>
        </Row>
        <RowLink
          label="Exchange rates"
          href="/settings/rates"
          value={refreshedText(fx.data?.lastSuccessAt)}
          valueClass={fx.data && isStale(fx.data.lastSuccessAt) ? 'text-warn' : 'text-tx3'}
        />
      </Group>

      {/* The person's answer, as the phone's Account › You has it; 5b moves it there.
          Hidden while the answer can't be read: a switch that cannot save would lie. */}
      {track.data && track.data !== 'unknown' && (
        <Group
          title="You"
          footer={track.data === 'yes'
            ? 'Money shows your pace, where it goes and where the journey lands. Only for you, on every journey. Saves as you switch it.'
            : 'Spending isn’t tracked on your journeys. Money shows the bookings. Saves as you switch it.'}
        >
          <Row label="Track spending">
            <Toggle on={track.data === 'yes'} onChange={(on) => setTrack.mutate(on)} label="Track spending" />
          </Row>
        </Group>
      )}
      <SaveError show={setTrack.isError} error={setTrack.error} />

      {/* Alerts moved to /account with the notification matrix (issue #13):
          they belong to the person, and a follower with no trip needs them
          too. One row keeps the old path working for whoever looks here. */}
      <Group>
        <RowLink label="Alerts" href="/account#alerts" value="under Account" />
      </Group>

      {/* Editors, not just the owner: invites_insert gates on can_edit_trip
          (migration 25), so hiding this from a co-editor would be the UI
          inventing a rule the database doesn't have. Viewers get nothing. */}
      {canEdit && <PeopleCard />}

      {/* Last on the page, per frame 28 — irreversible actions never sit above
          the things people came here to do. Viewers see it too: leaving a trip
          is the one destructive action a viewer legitimately has. */}
      <DangerZone tripName={meta.tripName ?? ''} />

      <p className="mt-4 text-center text-base text-tx3">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
        <img src="/brand/livhold-mark.png" alt="Livhold" width={18} height={18} className="inline-block align-[-0.25em]" />{' '}
        build v{process.env.NEXT_PUBLIC_BUILD_SHA} · updates apply automatically
      </p>
    </main>
  )
}
