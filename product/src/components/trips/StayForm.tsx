'use client'
import { useState } from 'react'
import type { Segment, Stay } from '@/lib/trips/types'
import { Modal } from './Modal'

const uid = (p: string) => p + Math.random().toString(36).slice(2, 8)
const input = 'mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900'

export function StayForm({
  initial, segments, currencies, onCancel, onSave,
}: {
  initial: Stay | null
  segments: Segment[]
  currencies: string[]
  onCancel: () => void
  onSave: (s: Stay) => void
}) {
  const [segId, setSegId] = useState(initial?.segId ?? segments[0]?.id ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [platform, setPlatform] = useState(initial?.platform ?? 'Booking.com')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [ppn, setPpn] = useState(initial?.ppn != null ? String(initial.ppn) : '')
  const [cur, setCur] = useState(initial?.cur ?? 'USD')
  const [status, setStatus] = useState(initial?.status ?? 'idea')
  const [rating, setRating] = useState(initial?.rating != null ? String(initial.rating) : '')
  const [nights, setNights] = useState(initial?.nights == null ? '' : String(initial.nights))
  const [notes, setNotes] = useState(initial?.notes ?? '')

  function submit() {
    if (!name.trim()) { alert('Enter a name'); return }
    const stay: Stay = {
      id: initial?.id ?? uid('st'),
      segId, name: name.trim(), platform, url, cur,
      ppn: Number(ppn) || 0,
      nights: nights === '' ? null : Number(nights),
      rating: Number(rating) || 0, status,
      include: initial?.include ?? false,
      notes,
    }
    onSave(stay)
  }

  return (
    <Modal title={initial ? 'Edit accommodation' : 'Add accommodation'} onClose={onCancel}>
      <div className="space-y-3">
        <label className="block text-sm">Stop
          <select className={input} value={segId} onChange={(e) => setSegId(e.target.value)}>
            {segments.map((s) => <option key={s.id} value={s.id}>{s.city} ({s.arrive})</option>)}
          </select>
        </label>
        <label className="block text-sm">Name<input className={input} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-sm">Platform<input className={input} value={platform} onChange={(e) => setPlatform(e.target.value)} /></label>
          <label className="block text-sm">Status
            <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
              {['idea', 'shortlist', 'chosen'].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className="block text-sm">Rating<input type="number" step="any" min="0" max="10" className={input} value={rating} onChange={(e) => setRating(e.target.value)} /></label>
        </div>
        <label className="block text-sm">Link<input className={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Booking / Airbnb URL" /></label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-sm">Price / night<input type="number" step="any" className={input} value={ppn} onChange={(e) => setPpn(e.target.value)} /></label>
          <label className="block text-sm">Currency
            <select className={input} value={cur} onChange={(e) => setCur(e.target.value)}>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="block text-sm">Nights<input type="number" className={input} value={nights} onChange={(e) => setNights(e.target.value)} placeholder="auto" /></label>
        </div>
        <label className="block text-sm">Notes<textarea rows={2} className={input} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <div className="flex gap-2 pt-1">
          <button onClick={submit} className="rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white">Save</button>
          <button onClick={onCancel} className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">Cancel</button>
        </div>
      </div>
    </Modal>
  )
}
