'use client'
import { useState } from 'react'
import type { TransportLeg } from '@/lib/trips/types'
import { Modal } from './Modal'

const uid = (p: string) => p + crypto.randomUUID()
const label = 'block text-base font-medium text-tx2'
const input =
  'mt-[5px] w-full rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 py-3 text-base font-medium text-tx outline-none transition-colors duration-[180ms] focus:border-ac'

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
          <label className={label}>Type
            <select className={input} value={type} onChange={(e) => setType(e.target.value)}>
              {['Flight', 'Train', 'Bus', 'Ferry', 'Other'].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className={label}>Date<input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>From<input className={input} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className={label}>To<input className={input} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>Provider<input className={input} value={provider} onChange={(e) => setProvider(e.target.value)} /></label>
          <label className={label}>Status
            <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
              {['idea', 'shortlist', 'booked'].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        </div>
        <label className={label}>Link<input className={input} value={url} onChange={(e) => setUrl(e.target.value)} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>Price<input type="number" step="any" className={input} value={price} onChange={(e) => setPrice(e.target.value)} /></label>
          <label className={label}>Currency
            <select className={input} value={cur} onChange={(e) => setCur(e.target.value)}>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <label className={label}>Notes<textarea rows={2} className={input} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <div className="flex gap-2 pt-1">
          <button onClick={submit} className="flex-1 rounded-[calc(var(--r)-2px)] bg-ac py-3.5 text-base font-semibold text-on">Save</button>
          <button onClick={onCancel} className="rounded-[calc(var(--r)-2px)] border-[1.5px] border-ln3 px-5 py-3.5 text-base font-semibold text-tx2">Cancel</button>
        </div>
      </div>
    </Modal>
  )
}
