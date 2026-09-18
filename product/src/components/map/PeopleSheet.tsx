'use client'
import { Users } from 'lucide-react'
import { MapModal } from './MapModal'
import type { Segment } from '@/lib/trips/types'
import { formatOverlap, overlaps, type PeopleAtCity, type PersonHere, type Summaries } from '@/lib/map/people'

// Who you follow is standing in this city (issue #9). Names only appear here,
// never on the globe; picking one draws their route beside yours, and any day
// your itineraries touch is written out — the reason to look at all.
const sub = 'text-base text-[rgba(216,224,229,.65)]'
const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export function PeopleSheet({
  group, segments, summaries, today, selectedId, onSelect, onClose,
}: {
  group: PeopleAtCity
  segments: Segment[]
  summaries: Summaries
  today: string
  selectedId: string | null
  onSelect: (p: PersonHere | null) => void
  onClose: () => void
}) {
  const n = group.people.length
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
        {group.people.map((p) => {
          const route = summaries[p.trip_id]?.route ?? []
          const meet = overlaps(segments, route, today)
          const on = selectedId === p.user_id
          return (
            <li key={p.user_id} className="border-t border-[rgba(216,224,229,.12)] py-3 first:border-t-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold">{p.name}</div>
                  <div className={'truncate ' + sub}>{p.tripName}{p.until ? ` · until ${day(p.until)}` : ''}</div>
                </div>
                <button
                  type="button"
                  onClick={() => onSelect(on ? null : p)}
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
                      {formatOverlap(o, p.name, today)}
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
