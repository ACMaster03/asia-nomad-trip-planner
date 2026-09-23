'use client'
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import { Sheet } from '@/app/(app)/live/Sheet'
import { useOnline } from '@/lib/useOnline'
import { createClient } from '@/lib/supabase/client'
import { searchCities } from '@/lib/catalogue/queries'
import { countryFlag } from '@/lib/catalogue/countryCurrencies'
import type { CityLite } from '@/lib/catalogue/types'
import { useMoney } from '@/lib/trips/Money'
import { nightsBetween, usdToBase, TIER_LABELS } from '@/lib/trips/format'
import type { CityCost } from '@/lib/trips/budget'
import { stayMoneyState, stayRange } from '@/lib/trips/timeline'
import type { Segment, Stay, Tier } from '@/lib/trips/types'
import { Chips, addLink, dangerBtn, fmtDay, hint, input, kicker, label, primaryBtn, uid } from './sheetKit'
import { normCity } from '@/lib/map/norm'

// The stop editor (mock 15 §4): a bottom sheet instead of the centred Modal.
// Arrive and Leave are the stop; the city and country were picked when the
// stop was added and are not re-asked. The comfort level lives here behind an
// ⓘ, not on the card, where it meant nothing next to a paid stay (round 1).
// The stop's stays are listed inside it, each opening its own sheet, which
// is what makes "a stop holds one or more stays" true in the editor as well.
// Delete stays below a rule, in the warning colour, as it was moved on
// 2026-09-19. The budget tick stays on the card, not in here.
//
// Adding a stop keeps the city picker from the old form (mock 03): debounced
// catalogue search, an offline fallback to the light list, and free text as a
// last resort, because places attach by city NAME and Erd is not catalogued.

const TONE = { ok: 'text-ac', warn: 'text-warn', muted: 'text-tx3' } as const

export function StopSheet({
  initial, cities, stays, cityCost, rates, nextCity, defaultArrive, todayIso, prefill, onClose, onSave, onDelete, onOpenStay, onAddStay,
}: {
  initial: Segment | null
  cities: CityLite[]
  /** a new stop opened from a transport entry that names it: the city and the day it arrives are already known */
  prefill?: { city: string; arrive?: string }
  /** the stop's stays, for the list inside the editor */
  stays: Stay[]
  cityCost: CityCost | undefined
  rates: Record<string, number>
  /** where the leg after this stop goes, for the consequence line */
  nextCity?: string
  defaultArrive: string
  todayIso: string
  onClose: () => void
  onSave: (seg: Segment, previous: Segment | null) => void
  onDelete?: () => void
  onOpenStay: (stay: Stay) => void
  onAddStay: () => void
}) {
  const { fmt } = useMoney()
  const known = prefill ? cities.find((c) => normCity(c.city) === normCity(prefill.city)) : undefined
  const [city, setCity] = useState(initial?.city ?? prefill?.city ?? '')
  const [country, setCountry] = useState(initial?.country ?? known?.country ?? '')
  const [tier, setTier] = useState<number>(initial?.tier ?? 1)
  const [arrive, setArrive] = useState(initial?.arrive ?? prefill?.arrive ?? defaultArrive ?? '')
  const [depart, setDepart] = useState(initial?.depart ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [showNote, setShowNote] = useState(!!initial?.notes)
  const [showInfo, setShowInfo] = useState(false)
  const sb = createClient()

  const [q, setQ] = useState('')
  const [picked, setPicked] = useState(!!initial?.city || !!prefill?.city)
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
    enabled: !initial && online && q.length >= 2 && !picked,
    staleTime: 5 * 60_000,
  })
  const offlineHits: CityLite[] =
    !initial && !online && q.length >= 2 && !picked
      ? cities.filter((c) => c.city.toLowerCase().startsWith(q.toLowerCase())).slice(0, 8)
      : []
  const results = online ? (hits.data ?? []) : offlineHits

  const nights = nightsBetween(arrive, depart)
  const bands = cityCost ? cityCost.accom.map((usd) => fmt(usdToBase(usd, rates))) : null

  function submit() {
    if (!city.trim()) { alert('Enter a city'); return }
    if (!arrive || !depart) { alert('Enter the arrive and leave dates'); return }
    if (depart < arrive) { alert("Leave can't be before arrive"); return }
    const t = Math.min(2, Math.max(0, tier)) as Tier
    const seg: Segment = initial
      ? { ...initial, tier: t, arrive, depart, notes }
      : { id: uid('sg'), city: city.trim(), country: country.trim(), tier: t, arrive, depart, notes, include: true, color: '' }
    onSave(seg, initial)
  }

  return (
    <Sheet label={initial ? `Edit ${initial.city}` : 'Add stop'} onClose={onClose}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="min-w-0 truncate text-[22px] font-semibold">{initial ? initial.city : 'Add stop'}</h3>
        {initial?.country && (
          <span className="min-w-0 truncate rounded-full bg-tag px-3 py-1 text-[13px] font-medium text-tag-ink">
            {countryFlag(initial.country)} {initial.country}
          </span>
        )}
      </div>

      {!initial && (
        <>
          <label className={label}>
            City
            <input className={input} value={city} placeholder="Type a city…" autoComplete="off" autoFocus onChange={(e) => { setCity(e.target.value); setPicked(false) }} />
          </label>
          {!picked && city.trim().length >= 2 && (
            <div className="-mt-2 overflow-hidden rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-sf">
              {!online && (
                <div className="border-b border-ln bg-warn-soft px-3 py-2 text-base text-warn">
                  📴 Offline, suggestions are limited. Type the name and it will be saved as-is.
                </div>
              )}
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setCity(c.city); setCountry(c.country); setPicked(true) }}
                  className="flex w-full items-center gap-2 border-b border-ln px-3 py-2.5 text-left last:border-0 hover:bg-fill"
                >
                  <span>{countryFlag(c.country)}</span>
                  <span className="flex-1">
                    <span className="text-base font-medium">{c.city}</span>
                    <span className="block text-base text-tx3">{[c.country, c.region_name].filter(Boolean).join(' · ')}</span>
                  </span>
                  {c.in_catalogue === false ? (
                    <span className="text-base text-tx3">{c.population ? `${Math.round(c.population / 1000)}k` : 'world'}</span>
                  ) : (
                    <span className="rounded-full border border-ac-line px-2 py-0.5 text-base font-medium text-ac">in catalogue</span>
                  )}
                </button>
              ))}
              <button type="button" onClick={() => setPicked(true)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-fill">
                <span>🏳️</span>
                <span className="flex-1">
                  <span className="text-base text-tx2">Use “{city.trim()}” as typed</span>
                  <span className="block text-base text-tx3">Not in the catalogue, costs won’t be estimated</span>
                </span>
              </button>
            </div>
          )}
          <label className={label}>
            Country
            <input className={input} value={country} onChange={(e) => setCountry(e.target.value)} />
          </label>
        </>
      )}

      <div>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            Arrive
            <input type="date" className={input} value={arrive} onChange={(e) => setArrive(e.target.value)} />
          </label>
          <label className={label}>
            Leave
            <input type="date" className={input} value={depart} onChange={(e) => setDepart(e.target.value)} />
          </label>
        </div>
        <div className={hint + ' mt-1.5'}>
          {nights > 0 ? `${nights} ${nights === 1 ? 'night' : 'nights'}.` : arrive && depart ? 'Leave is before arrive.' : ''}
          {initial && nextCity && nights > 0 ? ` Moving Leave moves the ${nextCity} leg with it.` : ''}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1.5">
          <span className={label}>Comfort</span>
          <button
            type="button"
            aria-label="What comfort means"
            aria-expanded={showInfo}
            onClick={() => setShowInfo((v) => !v)}
            className="-m-2 flex size-11 items-center justify-center text-tx3"
          >
            <Info aria-hidden className="size-[18px]" />
          </button>
        </div>
        <div className="mt-1">
          <Chips ariaLabel="Comfort" value={String(tier)} onChange={(v) => setTier(Number(v))} options={TIER_LABELS.map((l, i) => ({ value: String(i), label: l }))} />
        </div>
        {showInfo && (
          <p className={hint + ' mt-2 rounded-[calc(var(--r)-6px)] bg-fill px-3 py-2.5'}>
            Budget, Mid and Comfort choose which of {city || 'this city'}&rsquo;s three nightly price bands the estimate uses, until a stay is entered.{' '}
            {bands
              ? `Here: Budget ${bands[0]}, Mid ${bands[1]}, Comfort ${bands[2]} a night.`
              : `${city || 'This city'} is not in the catalogue, so there is no estimate until a stay is entered.`}{' '}
            It never changes a stay or a fare you typed.
          </p>
        )}
      </div>

      {initial && (
        <div>
          <div className={kicker}>Stays</div>
          <div className="mt-1 divide-y divide-ln">
            {stays.map((st) => {
              const r = stayRange(st, initial)
              const money = stayMoneyState(st, todayIso)
              return (
                <button key={st.id} type="button" onClick={() => onOpenStay(st)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left">
                  <span className="min-w-0">
                    <span className="block truncate text-base font-medium">{st.name || 'Stay'}</span>
                    <span className="block text-[13px] text-tx2">
                      {r ? `${fmtDay(r.from)} – ${fmtDay(r.to)} · ` : ''}
                      <span className={TONE[money.tone]}>{st.include === false && !st.status?.match(/booked|chosen/i) ? 'old option · not counted' : money.label}</span>
                    </span>
                  </span>
                  <span className="text-tx3">›</span>
                </button>
              )
            })}
            {!stays.length && <div className="py-2.5 text-base text-warn">No stay yet</div>}
          </div>
          <button type="button" onClick={onAddStay} className={addLink}>+ Add stay</button>
        </div>
      )}

      {!showNote ? (
        <button type="button" className={addLink + ' -my-2 text-tx2'} onClick={() => setShowNote(true)}>+ Note</button>
      ) : (
        <label className={label}>
          Note
          <textarea rows={2} className={input} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      )}
      <button type="button" onClick={submit} className={primaryBtn}>{initial ? 'Save' : 'Add stop'}</button>
      {initial && onDelete && (
        <div className="border-t border-ln pt-3">
          <button type="button" onClick={onDelete} className={dangerBtn}>Delete this stop</button>
        </div>
      )}
    </Sheet>
  )
}
