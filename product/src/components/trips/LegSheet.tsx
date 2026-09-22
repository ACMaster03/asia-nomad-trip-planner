'use client'
import { useState } from 'react'
import { Bus, Plane, Ship, TrainFront } from 'lucide-react'
import { Sheet } from '@/app/(app)/live/Sheet'
import { useMoney } from '@/lib/trips/Money'
import { toBase } from '@/lib/trips/format'
import { shortDate, stateOf, type Leg } from '@/lib/trips/timeline'
import type { TransportLeg } from '@/lib/trips/types'
import { Chips, StateChips, addLink, dangerBtn, hint, input, label, primaryBtn, uid } from './sheetKit'

// Transport on a leg (mock 15 §6, #58). From, to and the day are the leg's,
// taken from the stops on either side, and are not fields; the only date
// typed is a departure time. The connection is optional and small: it exists
// so the globe can draw the plane via Shanghai and so nobody adds Shanghai as
// a city and breaks the night count. A leg cannot be deleted, only emptied,
// because two stops always have a leg between them; "Remove transport" sits
// under a rule once an entry exists.
//
// An entry that matches no leg (its from/to name no stop on the journey any
// more) opens here too, with its own from and to as the title, so nothing is
// orphaned out of reach.

const TYPES: { value: string; label: React.ReactNode }[] = [
  { value: 'Flight', label: <><Plane aria-hidden className="size-4" /> Flight</> },
  { value: 'Train', label: <><TrainFront aria-hidden className="size-4" /> Train</> },
  { value: 'Bus', label: <><Bus aria-hidden className="size-4" /> Bus</> },
  { value: 'Ferry', label: <><Ship aria-hidden className="size-4" /> Ferry</> },
  { value: 'Other', label: 'Other' },
]
const asType = (t?: string) => {
  const m = TYPES.find((x) => x.value.toLowerCase() === (t ?? '').toLowerCase())
  return m ? m.value : t ? 'Other' : 'Flight'
}
/** "Mon, 31 Aug" — the timeline's month spelling, with the weekday in front. */
const longDay = (iso: string) =>
  iso ? `${new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' })}, ${shortDate(iso)}` : ''

export function LegSheet({
  leg, initial, rates, currencies, onClose, onSave, onRemove,
}: {
  leg: Leg | null
  initial: TransportLeg | null
  rates: Record<string, number>
  currencies: string[]
  onClose: () => void
  onSave: (t: TransportLeg) => void
  onRemove?: (id: string) => void
}) {
  const { base, fmt } = useMoney()
  const from = leg?.from.city ?? initial?.from ?? ''
  const to = leg?.to.city ?? initial?.to ?? ''
  const [type, setType] = useState(asType(initial?.type))
  const [otherType, setOtherType] = useState(initial && asType(initial.type) === 'Other' ? initial.type : '')
  const [date, setDate] = useState(initial?.date || leg?.date || '')
  const [time, setTime] = useState(initial?.time ?? '')
  const [via, setVia] = useState(initial?.via ?? '')
  const [hours, setHours] = useState(initial?.hours != null ? String(initial.hours) : '')
  const [showVia, setShowVia] = useState(!!initial?.via)
  const [price, setPrice] = useState(initial?.price ? String(initial.price) : '')
  const [cur, setCur] = useState(initial?.cur ?? (currencies.includes('USD') ? 'USD' : base))
  const [url, setUrl] = useState(initial?.url ?? '')
  const [showLink, setShowLink] = useState(!!initial?.url)
  const [state, setState] = useState<'idea' | 'booked'>(initial ? stateOf(initial.status) : 'idea')
  const [chargeDate, setChargeDate] = useState(initial?.chargeDate ?? '')
  const amount = Number(price) || 0
  const isFlight = type === 'Flight'

  function submit() {
    if (!from || !to) { alert('This entry has no from and to'); return }
    onSave({
      ...(initial ?? {}),
      id: initial?.id ?? uid('tr'),
      type: type === 'Other' ? otherType.trim() || 'Other' : type,
      from,
      to,
      date,
      time,
      via: isFlight && showVia ? via.trim() : '',
      hours: isFlight && showVia && hours !== '' ? Number(hours) : undefined,
      url,
      cur,
      price: amount,
      status: state,
      // An Idea with a price forecasts that price, Booked is money owed; there
      // is no third state, so every entry counts (round 1).
      include: true,
      chargeDate: state === 'booked' ? chargeDate : '',
      notes: initial?.notes ?? '',
    })
  }

  return (
    <Sheet label={initial ? 'Edit transport' : 'Add transport'} onClose={onClose}>
      <div>
        <div className="text-[12px] font-semibold uppercase tracking-[.12em] text-ac2-deep">
          {/* The entry's own day when it has one (an overnight flight leaves the day before the stop begins), else the leg's. */}
          {leg ? `Leg ${leg.index} · leaves ${leg.from.city}${(initial?.date || leg.date) ? ' ' + longDay(initial?.date || leg.date) : ''}` : 'Not on a leg of this journey'}
        </div>
        <h3 className="mt-0.5 text-[22px] font-semibold">{from} → {to}</h3>
      </div>
      <Chips ariaLabel="Type" value={type} onChange={setType} options={TYPES} />
      {type === 'Other' && (
        <input aria-label="What kind of transport" className={input + ' mt-0'} placeholder="Car, boat, …" value={otherType} onChange={(e) => setOtherType(e.target.value)} />
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          Departs
          <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className={label}>
          Time
          <input type="time" className={input} value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      {isFlight && !showVia && (
        <button type="button" className={addLink + ' -my-2 text-tx2'} onClick={() => setShowVia(true)}>
          + Connection <span className="ml-1 font-normal text-tx3">· optional</span>
        </button>
      )}
      {isFlight && showVia && (
        <div className="grid grid-cols-[1fr_96px] gap-3">
          <label className={label}>
            Via
            <input className={input} placeholder="Shanghai" value={via} onChange={(e) => setVia(e.target.value)} />
          </label>
          <label className={label}>
            Hours
            <input type="number" inputMode="decimal" step="0.25" min="0" className={input} placeholder="14.5" value={hours} onChange={(e) => setHours(e.target.value)} />
          </label>
        </div>
      )}
      <div>
        <div className="grid grid-cols-[1fr_96px] gap-3">
          <label className={label}>
            Price
            <input type="number" inputMode="decimal" step="any" min="0" className={input + ' text-[22px] font-semibold'} placeholder="for everyone" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label className={label}>
            Currency
            <select className={input} value={cur} onChange={(e) => setCur(e.target.value)}>
              {!currencies.includes(cur) && <option value={cur}>{cur}</option>}
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
        {amount > 0 && cur !== base && <div className={hint + ' mt-1.5'}>≈ {fmt(toBase(amount, cur, rates))}</div>}
      </div>
      {!showLink ? (
        <button type="button" className={addLink + ' -my-2 text-tx2'} onClick={() => setShowLink(true)}>+ Link</button>
      ) : (
        <label className={label}>
          Link
          <input className={input} inputMode="url" placeholder="Booking page" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
      )}
      <div>
        <StateChips value={state} onChange={setState} />
        <div className={hint + ' mt-1.5'}>Booked adds the charge date and draws the leg solid.</div>
      </div>
      {state === 'booked' && (
        <label className={label}>
          Card charged on
          <input type="date" className={input} value={chargeDate} onChange={(e) => setChargeDate(e.target.value)} />
          <span className={hint + ' mt-1.5 block font-normal'}>Blank means the travel date. Fares are usually paid at booking.</span>
        </label>
      )}
      <button type="button" onClick={submit} className={primaryBtn}>Save</button>
      {initial && onRemove && (
        <div className="border-t border-ln pt-3">
          <button type="button" onClick={() => onRemove(initial.id)} className={dangerBtn}>Remove transport</button>
        </div>
      )}
    </Sheet>
  )
}
