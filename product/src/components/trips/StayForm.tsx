'use client'
import { useState } from 'react'
import type {CityLite } from '@/lib/catalogue/types'
import type { Segment, Stay } from '@/lib/trips/types'
import { Modal } from './Modal'
import { SegmentForm } from './SegmentForm'

const uid = (p: string) => p + crypto.randomUUID()
const label = 'block text-base font-medium text-tx2'
const input =
  'mt-[5px] w-full rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 py-3 text-base font-medium text-tx outline-none transition-colors duration-[180ms] focus:border-ac'

const NEW_STOP = '__new-stop__'

export function StayForm({
  initial, segments, currencies, onCancel, onSave,
  defaultSegId, cities = [], defaultArrive = '', onCreateStop,
}: {
  initial: Stay | null
  segments: Segment[]
  currencies: string[]
  onCancel: () => void
  onSave: (s: Stay) => void
  /** preselect a stop (e.g. the "＋ stay" shortcut on a Stops card) */
  defaultSegId?: string
  cities?: CityLite[]
  defaultArrive?: string
  /** create a stop without leaving the form (owner request 2026-07-24) */
  onCreateStop?: (seg: Segment) => void
}) {
  const [segId, setSegId] = useState(initial?.segId ?? defaultSegId ?? segments[0]?.id ?? '')
  const [stopFormOpen, setStopFormOpen] = useState(false)
  const [name, setName] = useState(initial?.name ?? '')
  const [platform, setPlatform] = useState(initial?.platform ?? 'Booking.com')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [ppn, setPpn] = useState(initial?.ppn != null ? String(initial.ppn) : '')
  const [cur, setCur] = useState(initial?.cur ?? 'USD')
  const [status, setStatus] = useState(initial?.status ?? 'idea')
  const [rating, setRating] = useState(initial?.rating != null ? String(initial.rating) : '')
  const [nights, setNights] = useState(initial?.nights == null ? '' : String(initial.nights))
  const [cancelUntil, setCancelUntil] = useState(initial?.cancelUntil ?? '')
  const [chargeDate, setChargeDate] = useState(initial?.chargeDate ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  function submit() {
    if (!segId) { alert('Pick (or create) a stop first'); return }
    if (!name.trim()) { alert('Enter a name'); return }
    const stay: Stay = {
      id: initial?.id ?? uid('st'),
      segId, name: name.trim(), platform, url, cur,
      ppn: Number(ppn) || 0,
      nights: nights === '' ? null : Number(nights),
      rating: Number(rating) || 0, status,
      include: initial?.include ?? false,
      cancelUntil, chargeDate,
      notes,
    }
    onSave(stay)
  }

  return (
    <Modal title={initial ? 'Edit accommodation' : 'Add accommodation'} onClose={onCancel}>
      <div className="space-y-3">
        <label className={label}>Stop
          <select
            className={input}
            value={segId}
            onChange={(e) => {
              if (e.target.value === NEW_STOP) setStopFormOpen(true)
              else setSegId(e.target.value)
            }}
          >
            {!segments.length && <option value="">— no stops yet —</option>}
            {segments.map((s) => <option key={s.id} value={s.id}>{s.city} ({s.arrive})</option>)}
            {onCreateStop && <option value={NEW_STOP}>＋ New stop…</option>}
          </select>
          <span className="mt-1 block text-base font-normal text-tx3">
            Accommodation always belongs to a stop — the city, dates and nightly
            budget math come from it.
          </span>
        </label>
        <label className={label}>Name<input className={input} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <div className="grid grid-cols-3 gap-3">
          <label className={label}>Platform<input className={input} value={platform} onChange={(e) => setPlatform(e.target.value)} /></label>
          <label className={label}>Status
            <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
              {['idea', 'shortlist', 'chosen'].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className={label}>Rating<input type="number" step="any" min="0" max="10" className={input} value={rating} onChange={(e) => setRating(e.target.value)} /></label>
        </div>
        <label className={label}>Link<input className={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Booking / Airbnb URL" /></label>
        <div className="grid grid-cols-3 gap-3">
          <label className={label}>Price / night<input type="number" step="any" className={input} value={ppn} onChange={(e) => setPpn(e.target.value)} /></label>
          <label className={label}>Currency
            <select className={input} value={cur} onChange={(e) => setCur(e.target.value)}>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className={label}>Nights<input type="number" className={input} value={nights} onChange={(e) => setNights(e.target.value)} placeholder="auto" /></label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>Free cancel until<input type="date" className={input} value={cancelUntil} onChange={(e) => setCancelUntil(e.target.value)} /></label>
          <label className={label}>Card charged on<input type="date" className={input} value={chargeDate} onChange={(e) => setChargeDate(e.target.value)} /></label>
        </div>
        <label className={label}>Notes<textarea rows={2} className={input} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <div className="flex gap-2 pt-1">
          <button onClick={submit} className="flex-1 rounded-[calc(var(--r)-2px)] bg-ac py-3.5 text-base font-semibold text-on">Save</button>
          <button onClick={onCancel} className="rounded-[calc(var(--r)-2px)] border-[1.5px] border-ln3 px-5 py-3.5 text-base font-semibold text-tx2">Cancel</button>
        </div>
      </div>
      {stopFormOpen && onCreateStop && (
        <SegmentForm
          initial={null}
          cities={cities}
          defaultArrive={defaultArrive}
          onCancel={() => setStopFormOpen(false)}
          onSave={(seg) => {
            onCreateStop(seg)
            setSegId(seg.id) // optimistic state makes it appear in the select
            setStopFormOpen(false)
          }}
        />
      )}
    </Modal>
  )
}
