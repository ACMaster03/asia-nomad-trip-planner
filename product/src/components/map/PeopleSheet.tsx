'use client'
import { Users } from 'lucide-react'
import { MapModal } from './MapModal'
import type { Segment } from '@/lib/trips/types'
import { formatOverlap, overlaps, type PeopleAtCity, type PersonHere, type Summaries } from '@/lib/map/people'

// Who you follow is standing in this city (issue #9). Names only appear here,
// never on the globe. One block per TRIP (Patrik, 2026-09-18): the people you
// follow on it, named together — never the trip's other travellers — and the
// days your itineraries touch, written once. A route belongs to the trip, so
// "Show route" is per trip too.
const sub = 'text-base text-[rgba(216,224,229,.65)]'
const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export interface TripPick { trip_id: string; label: string }

/** "Anna", "Anna and Tom", "Anna, Bea and Tom" */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export function byTrip(people: readonly PersonHere[]): Array<{ trip_id: string; tripName: string; until: string | null; names: string[] }> {
  const m = new Map<string, { trip_id: string; tripName: string; until: string | null; names: string[] }>()
  for (const p of people) {
    const g = m.get(p.trip_id)
    if (g) g.names.push(p.name)
    else m.set(p.trip_id, { trip_id: p.trip_id, tripName: p.tripName, until: p.until, names: [p.name] })
  }
  return [...m.values()].map((g) => ({ ...g, names: g.names.slice().sort((a, b) => a.localeCompare(b)) }))
}

export function PeopleSheet({
  group, segments, summaries, today, selectedTrip, onSelect, onClose,
}: {
  group: PeopleAtCity
  segments: Segment[]
  summaries: Summaries
  today: string
  selectedTrip: string | null
  onSelect: (pick: TripPick | null) => void
  onClose: () => void
}) {
  const n = group.people.length
  const trips = byTrip(group.people)
  return (
    <MapModal
      title={
        <span className="flex items-center gap-2">
          <Users aria-hidden className="size-5 flex-none text-[#8CB8DC]" strokeWidth={2} />
          {group.city}
        </span>
      }
      label={`People you follow in ${group.city}`}
      onClose={onClose}
    >
      <div className={sub}>{n} traveller{n === 1 ? '' : 's'} you follow {n === 1 ? 'is' : 'are'} here{group.country ? ` · ${group.country}` : ''}</div>
      <ul className="mt-3 flex flex-col">
        {trips.map((t) => {
          const route = summaries[t.trip_id]?.route ?? []
          const meet = overlaps(segments, route, today)
          const on = selectedTrip === t.trip_id
          const label = joinNames(t.names)
          return (
            <li key={t.trip_id} className="border-t border-[rgba(216,224,229,.12)] py-3 first:border-t-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold">{label}</div>
                  <div className={'truncate ' + sub}>{t.tripName}{t.until ? ` · until ${day(t.until)}` : ''}</div>
                </div>
                <button
                  type="button"
                  onClick={() => onSelect(on ? null : { trip_id: t.trip_id, label })}
                  aria-pressed={on}
                  className={`flex-none rounded-full border px-3.5 py-2 text-base font-medium ${on ? 'border-[#8CB8DC] bg-[rgba(140,184,220,.16)] text-[#8CB8DC]' : 'border-[rgba(216,224,229,.24)]'}`}
                >
                  {on ? 'Hide route' : 'Show route'}
                </button>
              </div>
              {meet.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {meet.map((o) => (
                    <li key={`${o.city}${o.start}`} className="flex items-start gap-2 text-base leading-snug">
                      <i aria-hidden className="mt-[7px] block h-[9px] w-[9px] flex-none rounded-full bg-[#8CB8DC]" />
                      {formatOverlap(o, t.names, today)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
      <div className="mt-4">
        <button className="rounded-full border border-[rgba(216,224,229,.24)] px-4 py-2 text-base font-medium" onClick={onClose}>
          Close
        </button>
      </div>
    </MapModal>
  )
}
