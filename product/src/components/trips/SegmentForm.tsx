'use client'
import { useId, useState } from 'react'
import type { City } from '@/lib/catalogue/types'
import type { Segment, Tier } from '@/lib/trips/types'
import { Modal } from './Modal'

const uid = (p: string) => p + Math.random().toString(36).slice(2, 8)
const input = 'mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900'

export function SegmentForm({
  initial,
  cities,
  defaultArrive,
  onCancel,
  onSave,
}: {
  initial: Segment | null
  cities: City[]
  defaultArrive: string
  onCancel: () => void
  onSave: (s: Segment) => void
}) {
  const [city, setCity] = useState(initial?.city ?? '')
  const [country, setCountry] = useState(initial?.country ?? '')
  const [tier, setTier] = useState<number>(initial?.tier ?? 1)
  const [arrive, setArrive] = useState(initial?.arrive ?? defaultArrive ?? '')
  const [depart, setDepart] = useState(initial?.depart ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const dlId = useId()

  function onCityChange(v: string) {
    setCity(v)
    if (!country) {
      const m = cities.find((c) => c.city === v)
      if (m) setCountry(m.country) // auto-fill country from the catalogue, like the static app
    }
  }
  function submit() {
    if (!city.trim()) { alert('Enter a city'); return }
    if (!arrive || !depart) { alert('Enter arrive and depart dates'); return }
    if (+new Date(depart) < +new Date(arrive)) { alert("Depart can't be before arrive"); return }
    const t = Math.min(2, Math.max(0, tier)) as Tier
    const seg: Segment = initial
      ? { ...initial, city: city.trim(), country: country.trim(), tier: t, arrive, depart, notes }
      : { id: uid('sg'), city: city.trim(), country: country.trim(), tier: t, arrive, depart, notes, include: true, color: '' }
    onSave(seg)
  }

  return (
    <Modal title={initial ? 'Edit stop' : 'Add stop'} onClose={onCancel}>
      <div className="space-y-3">
        <label className="block text-sm">
          City
          <input className={input} list={dlId} value={city} onChange={(e) => onCityChange(e.target.value)} />
        </label>
        <datalist id={dlId}>
          {cities.map((c) => <option key={c.id} value={c.city} />)}
        </datalist>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            Country
            <input className={input} value={country} onChange={(e) => setCountry(e.target.value)} />
          </label>
          <label className="block text-sm">
            Comfort tier
            <select className={input} value={tier} onChange={(e) => setTier(Number(e.target.value))}>
              <option value={0}>Budget</option>
              <option value={1}>Mid</option>
              <option value={2}>Comfort</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            Arrive
            <input type="date" className={input} value={arrive} onChange={(e) => setArrive(e.target.value)} />
          </label>
          <label className="block text-sm">
            Depart
            <input type="date" className={input} value={depart} onChange={(e) => setDepart(e.target.value)} />
          </label>
        </div>
        <label className="block text-sm">
          Notes
          <textarea rows={2} className={input} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="flex gap-2 pt-1">
          <button onClick={submit} className="rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white">Save</button>
          <button onClick={onCancel} className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">Cancel</button>
        </div>
      </div>
    </Modal>
  )
}
