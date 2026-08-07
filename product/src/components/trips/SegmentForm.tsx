'use client'
import { useEffect, useRef, useState } from 'react'
import { useOnline } from '@/lib/useOnline'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { searchCities } from '@/lib/catalogue/queries'
import { countryFlag } from '@/lib/catalogue/countryCurrencies'
import type { CityLite } from '@/lib/catalogue/types'
import type { Segment, Tier } from '@/lib/trips/types'
import { Modal } from './Modal'

const uid = (p: string) => p + crypto.randomUUID()
const label = 'block min-w-0 text-base font-medium text-tx2'
const input =
  'mt-[5px] w-full rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 py-3 text-base font-medium text-tx outline-none transition-colors duration-[180ms] focus:border-ac'

export function SegmentForm({
  initial,
  cities,
  defaultArrive,
  onCancel,
  onSave,
}: {
  initial: Segment | null
  cities: CityLite[]
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
  const sb = createClient()

  // Approved endframe: mock 03 "City picker". Replaces a <datalist> holding
  // EVERY city — fine at 46, impossible once the world import lands. Debounced
  // so typing never waits on a round trip.
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState(!!initial?.city)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => setQ(city.trim()), 250)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [city])

  const online = useOnline()

  const hits = useQuery({
    queryKey: ['city-search', q],
    queryFn: () => searchCities(sb, q, 8),
    enabled: online && q.length >= 2 && !picked,
    staleTime: 5 * 60_000,
  })
  // Offline the RPC is unavailable, so fall back to the lite list already in
  // cache. Adding a stop must never require signal (mock 03 "Picker offline").
  const offlineHits: CityLite[] =
    !online && q.length >= 2 && !picked
      ? cities.filter((c) => c.city.toLowerCase().startsWith(q.toLowerCase())).slice(0, 8)
      : []
  const results = online ? (hits.data ?? []) : offlineHits

  function onCityChange(v: string) {
    setCity(v)
    setPicked(false)
  }
  function choose(c: CityLite) {
    setCity(c.city)
    setCountry(c.country)   // drives the FX watchlist auto-add + banner (mock 12)
    setPicked(true)
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
        <label className={label}>
          City
          <input
            className={input}
            value={city}
            placeholder="Type a city…"
            autoComplete="off"
            onChange={(e) => onCityChange(e.target.value)}
          />
        </label>
        {!picked && city.trim().length >= 2 && (
          <div className="-mt-1 overflow-hidden rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-sf">
            {!online && (
              <div className="border-b border-ln bg-warn-soft px-3 py-2 text-base text-warn">
                📴 Offline — suggestions are limited. Type the name and it will be saved as-is.
              </div>
            )}
            {results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => choose(c)}
                className="flex w-full items-center gap-2 border-b border-ln px-3 py-2.5 text-left last:border-0 hover:bg-fill"
              >
                <span>{countryFlag(c.country)}</span>
                <span className="flex-1">
                  <span className="text-base font-medium">{c.city}</span>
                  <span className="block text-base text-tx3">
                    {[c.country, c.region_name].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {/* Curated cities can price a budget; imported GeoNames ones
                    cannot, and saying so is the honest signal (mock 03). */}
                {c.in_catalogue === false ? (
                  <span className="text-base text-tx3">
                    {c.population ? `${Math.round(c.population / 1000)}k` : 'world'}
                  </span>
                ) : (
                  <span className="rounded-full border border-ac-line px-2 py-0.5 text-base font-medium text-ac">
                    in catalogue
                  </span>
                )}
              </button>
            ))}
            {/* MANDATORY, not a nicety: Erd is not in the catalogue and user
                places attach by city NAME (migration 14), so free text must
                keep working or existing trips break. */}
            <button
              type="button"
              onClick={() => setPicked(true)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-fill"
            >
              <span>🏳️</span>
              <span className="flex-1">
                <span className="text-base text-tx2">Use “{city.trim()}” as typed</span>
                <span className="block text-base text-tx3">
                  Not in the catalogue — costs won’t be estimated
                </span>
              </span>
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            Country
            <input className={input} value={country} onChange={(e) => setCountry(e.target.value)} />
          </label>
          <label className={label}>
            Comfort tier
            <select className={input} value={tier} onChange={(e) => setTier(Number(e.target.value))}>
              <option value={0}>Budget</option>
              <option value={1}>Mid</option>
              <option value={2}>Comfort</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            Arrive
            <input type="date" className={input} value={arrive} onChange={(e) => setArrive(e.target.value)} />
          </label>
          <label className={label}>
            Depart
            <input type="date" className={input} value={depart} onChange={(e) => setDepart(e.target.value)} />
          </label>
        </div>
        <label className={label}>
          Notes
          <textarea rows={2} className={input} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="flex gap-2 pt-1">
          <button onClick={submit} className="flex-1 rounded-[calc(var(--r)-2px)] bg-ac py-3.5 text-base font-semibold text-on">Save</button>
          <button onClick={onCancel} className="rounded-[calc(var(--r)-2px)] border-[1.5px] border-ln3 px-5 py-3.5 text-base font-semibold text-tx2">Cancel</button>
        </div>
      </div>
    </Modal>
  )
}
