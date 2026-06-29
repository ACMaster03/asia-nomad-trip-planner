'use client'
import { useState } from 'react'
import type { TransportLeg } from '@/lib/trips/types'
import { Modal } from './Modal'

const uid = (p: string) => p + Math.random().toString(36).slice(2, 8)
const input = 'mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900'

export function TransportForm({
  initial, currencies, onCancel, onSave,
}: {
  initial: TransportLeg | null
  currencies: string[]
  onCancel: () => void
  onSave: (t: TransportLeg) => void
}) {
  const [type, setType] = useState(initial?.type ?? 'Flight')
  const [date, setDate] = useState(initial?.date ?? '')
  const [from, setFrom] = useState(initial?.from ?? '')
  const [to, setTo] = useState(initial?.to ?? '')
  const [provider, setProvider] = useState(initial?.provider ?? 'Google Flights')
  const [status, setStatus] = useState(initial?.status ?? 'idea')
  const [url, setUrl] = useState(initial?.url ?? 'https://www.google.com/travel/flights')
  const [price, setPrice] = useState(initial?.price != null ? String(initial.price) : '')
  const [cur, setCur] = useState(initial?.cur ?? 'USD')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  function submit() {
    if (!from.trim() || !to.trim()) { alert('Enter from and to'); return }
    const leg: TransportLeg = {
      id: initial?.id ?? uid('tr'),
      type, from: from.trim(), to: to.trim(), date, provider, url, cur,
      price: Number(price) || 0, status,
      include: initial?.include ?? false,
      notes,
    }
    onSave(leg)
  }

  return (
    <Modal title={initial ? 'Edit transport leg' : 'Add transport leg'} onClose={onCancel}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">Type
            <select className={input} value={type} onChange={(e) => setType(e.target.value)}>
              {['Flight', 'Train', 'Bus', 'Ferry', 'Other'].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className="block text-sm">Date<input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">From<input className={input} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="block text-sm">To<input className={input} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">Provider<input className={input} value={provider} onChange={(e) => setProvider(e.target.value)} /></label>
          <label className="block text-sm">Status
            <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
              {['idea', 'shortlist', 'booked'].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-sm">Link<input className={input} value={url} onChange={(e) => setUrl(e.target.value)} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">Price<input type="number" step="any" className={input} value={price} onChange={(e) => setPrice(e.target.value)} /></label>
          <label className="block text-sm">Currency
            <select className={input} value={cur} onChange={(e) => setCur(e.target.value)}>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
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
