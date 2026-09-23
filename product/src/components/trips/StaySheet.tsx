'use client'
import { useState } from 'react'
import { Sheet } from '@/app/(app)/live/Sheet'
import { useMoney } from '@/lib/trips/Money'
import { nightsBetween, toBase } from '@/lib/trips/format'
import { addDays, stateOf, stayRange, type NightRange } from '@/lib/trips/timeline'
import type { Segment, Stay } from '@/lib/trips/types'
import { Chips, StateChips, Toggle, addLink, chipCls, dangerBtn, fmtDay, hint, input, kicker, label, primaryBtn, uid } from './sheetKit'

// Add / edit a stay (mock 15 §5, #60). Opened from a stop's "+ Add stay",
// from a stay row, or from an amber "No bed" row with those nights already
// in. The two deadline dates are asked HERE, when the stay is added, each
// with an explicit no. A blank used to mean both "never asked" and "no
// cancellation window", and on the live trip both produced no reminder; now
// a blank means "still to enter" and the stop card says so.
//
// Two states, Idea and Booked (round 1). Booked is what makes Money import
// the stay on its charge date, as before (commitment.ts). Idea keeps the
// deadline fields hidden; they appear the moment Booked is chosen.

const PLATFORMS = ['Booking.com', 'Airbnb', 'Other'] as const
type Platform = (typeof PLATFORMS)[number]
const asPlatform = (p?: string): Platform => (p === 'Booking.com' || p === 'Airbnb' ? p : p ? 'Other' : 'Booking.com')

export function StaySheet({
  initial, seg, range, rates, currencies, onClose, onSave, onDelete,
}: {
  initial: Stay | null
  seg: Segment
  /** the nights to fill in when adding: an amber gap row, or the stop's own dates */
  range: NightRange | null
  rates: Record<string, number>
  currencies: string[]
  onClose: () => void
  onSave: (s: Stay) => void
  onDelete?: (id: string) => void
}) {
  const { base, fmt } = useMoney()
  const init = initial ? stayRange(initial, seg) : range
  const [name, setName] = useState(initial?.name ?? '')
  const [platform, setPlatform] = useState<Platform>(asPlatform(initial?.platform))
  const [platformOther, setPlatformOther] = useState(initial && asPlatform(initial.platform) === 'Other' ? (initial.platform ?? '') : '')
  const [checkIn, setCheckIn] = useState(init?.from ?? seg.arrive ?? '')
  const [checkOut, setCheckOut] = useState(init?.to ?? seg.depart ?? '')
  const [ppn, setPpn] = useState(initial?.ppn ? String(initial.ppn) : '')
  const [cur, setCur] = useState(initial?.cur ?? (currencies.includes('USD') ? 'USD' : base))
  const [state, setState] = useState<'idea' | 'booked'>(initial ? stateOf(initial.status) : 'idea')
  const [cancelUntil, setCancelUntil] = useState(initial?.cancelUntil ?? '')
  const [noFreeCancel, setNoFreeCancel] = useState(!!initial?.noFreeCancel)
  const [chargeDate, setChargeDate] = useState(initial?.chargeAtCheckIn ? '' : (initial?.chargeDate ?? ''))
  const [chargeAtCheckIn, setChargeAtCheckIn] = useState(!!initial?.chargeAtCheckIn)
  const [remind, setRemind] = useState(initial?.remind !== false)
  const [url, setUrl] = useState(initial?.url ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [showLink, setShowLink] = useState(!!initial?.url)
  const [showNote, setShowNote] = useState(!!initial?.notes)
  // A stay left unticked on the old Stays tab was an option that did not
  // count. It keeps not counting until told otherwise; a new stay counts.
  const legacyUncounted = !!initial && !initial.include
  const [count, setCount] = useState(!legacyUncounted)

  const nights = nightsBetween(checkIn, checkOut)
  const price = Number(ppn) || 0
  const perNight = toBase(price, cur, rates)
  const remindRow = state === 'booked' && !!cancelUntil && !noFreeCancel

  function submit() {
    if (!name.trim()) { alert('Give the stay a name'); return }
    if (!checkIn || !checkOut || nights <= 0) { alert('Check-out has to be after check-in'); return }
    const stay: Stay = {
      ...(initial ?? {}),
      id: initial?.id ?? uid('st'),
      segId: seg.id,
      name: name.trim(),
      platform: platform === 'Other' ? platformOther.trim() || 'Other' : platform,
      url,
      cur,
      ppn: price,
      nights: undefined, // the dates carry the nights now
      checkIn,
      checkOut,
      status: state,
      include: state === 'booked' ? true : count,
      cancelUntil: noFreeCancel ? '' : cancelUntil,
      noFreeCancel,
      chargeDate: chargeAtCheckIn ? checkIn : chargeDate,
      chargeAtCheckIn,
      remind,
      notes,
    }
    onSave(stay)
  }

  return (
    <Sheet label={initial ? 'Edit stay' : 'Add stay'} onClose={onClose}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[22px] font-semibold">{initial ? 'Edit stay' : 'Add stay'}</h3>
        <span className="min-w-0 truncate rounded-full bg-tag px-3 py-1 text-[13px] font-medium text-tag-ink">
          {seg.city} · {fmtDay(checkIn)} – {fmtDay(checkOut)}
        </span>
      </div>
      <label className={label}>
        Name
        <input className={input} placeholder="Where you sleep" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <Chips ariaLabel="Platform" value={platform} onChange={setPlatform} options={PLATFORMS.map((p) => ({ value: p, label: p }))} />
      {platform === 'Other' && (
        <input aria-label="Platform name" className={input + ' mt-0'} placeholder="The hotel's site, a friend, …" value={platformOther} onChange={(e) => setPlatformOther(e.target.value)} />
      )}
      <div>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            Check-in
            <input type="date" className={input} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
          </label>
          <label className={label}>
            Check-out
            <input type="date" className={input} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
          </label>
        </div>
        <div className={hint + ' mt-1.5'}>{nights > 0 ? `${nights} ${nights === 1 ? 'night' : 'nights'}` : 'Check-out has to be after check-in.'}</div>
      </div>
      <div>
        <div className="grid grid-cols-[1fr_96px] gap-3">
          <label className={label}>
            Per night
            <input type="number" inputMode="decimal" step="any" min="0" className={input + ' text-[22px] font-semibold'} placeholder="0" value={ppn} onChange={(e) => setPpn(e.target.value)} />
          </label>
          <label className={label}>
            Currency
            <select className={input} value={cur} onChange={(e) => setCur(e.target.value)}>
              {!currencies.includes(cur) && <option value={cur}>{cur}</option>}
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
        {price > 0 && nights > 0 && (
          <div className={hint + ' mt-1.5'}>
            {cur !== base ? `≈ ${fmt(perNight)} a night · ≈ ${fmt(perNight * nights)} for ${nights}.` : `${fmt(price * nights)} for ${nights}.`}
          </div>
        )}
      </div>
      <StateChips value={state} onChange={setState} />
      {legacyUncounted && state === 'idea' && (
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-base font-medium">Count this idea in the plan</span>
            <span className={hint}>It was an option on the old Stays tab and did not count.</span>
          </span>
          <Toggle on={count} onChange={setCount} label="Count this idea in the plan" />
        </div>
      )}
      {state === 'booked' && (
        <div className="border-t border-ln pt-3">
          <div className={kicker}>Deadlines</div>
          <div className={label + ' mt-2'}>Free cancellation until</div>
          <div className="mt-[5px] grid grid-cols-[1fr_auto_auto] items-center gap-2">
            <input type="date" aria-label="Free cancellation until" className={input + ' mt-0'} value={noFreeCancel ? '' : cancelUntil} disabled={noFreeCancel} onChange={(e) => setCancelUntil(e.target.value)} />
            <span className="text-base text-tx3">or</span>
            <button type="button" aria-pressed={noFreeCancel} onClick={() => setNoFreeCancel((v) => !v)} className={chipCls(noFreeCancel)}>
              No free cancellation
            </button>
          </div>
          <div className={label + ' mt-3'}>Card charged on</div>
          <div className="mt-[5px] grid grid-cols-[1fr_auto_auto] items-center gap-2">
            <input type="date" aria-label="Card charged on" className={input + ' mt-0'} value={chargeAtCheckIn ? '' : chargeDate} disabled={chargeAtCheckIn} onChange={(e) => setChargeDate(e.target.value)} />
            <span className="text-base text-tx3">or</span>
            <button type="button" aria-pressed={chargeAtCheckIn} onClick={() => setChargeAtCheckIn((v) => !v)} className={chipCls(chargeAtCheckIn)}>
              At check-in
            </button>
          </div>
          {remindRow && (
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-base font-medium">Remind me before it&rsquo;s non-refundable</span>
                <span className={hint}>On Home from {fmtDay(addDays(cancelUntil, -7))}, and by email 7, 3 and 1 days before.</span>
              </span>
              <Toggle on={remind} onChange={setRemind} label="Remind me before it's non-refundable" />
            </div>
          )}
        </div>
      )}
      {(!showLink || !showNote) && (
        <div className="-my-2 flex flex-wrap gap-x-5">
          {!showLink && <button type="button" className={addLink + ' text-tx2'} onClick={() => setShowLink(true)}>+ Link</button>}
          {!showNote && <button type="button" className={addLink + ' text-tx2'} onClick={() => setShowNote(true)}>+ Note</button>}
        </div>
      )}
      {showLink && (
        <label className={label}>
          Link
          <input className={input} inputMode="url" placeholder="Booking / Airbnb URL" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
      )}
      {showNote && (
        <label className={label}>
          Note
          <textarea rows={2} className={input} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      )}
      <button type="button" onClick={submit} className={primaryBtn}>{initial ? 'Save' : 'Add stay'}</button>
      {initial && onDelete && (
        <div className="border-t border-ln pt-3">
          <button type="button" onClick={() => onDelete(initial.id)} className={dangerBtn}>Delete this stay</button>
        </div>
      )}
    </Sheet>
  )
}
