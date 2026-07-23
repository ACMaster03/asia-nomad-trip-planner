'use client'
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchPlaces, insertUserPlace } from '@/lib/catalogue/queries'
import { qk } from '@/lib/catalogue/keys'
import type { City, Place, PlaceKind } from '@/lib/catalogue/types'
import type { TripEventVisibility } from '@/lib/trips/events'
import { Modal } from '@/components/trips/Modal'

const input =
  'mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900'

export const PLACE_KIND_ICON: Record<PlaceKind, string> = {
  landmark: '🛕',
  restaurant: '🍜',
  cafe: '☕',
  activity: '🎟️',
  stay: '🛏️',
  transporthub: '🚉',
  other: '📌',
}
const PLACE_KINDS = Object.keys(PLACE_KIND_ICON) as PlaceKind[]

export type CheckInInput = {
  placeId: string | null
  placeName: string
  rating: number | null
  comment: string
  visibility: TripEventVisibility
}

// Step 1 (pick a place, searchable, scoped to the current stop's city) +
// step 2 (rating/comment/visibility — all optional) in one sheet, per the mock:
// "select place → Save" is a valid 2-tap check-in. The "Add a place here"
// mini-form (name + kind) inserts a source='user' place inline.
export function CheckInModal({
  cityName,
  cities,
  saving,
  onClose,
  onSave,
}: {
  cityName: string | null
  cities: City[]
  saving: boolean
  onClose: () => void
  onSave: (v: CheckInInput) => void
}) {
  const sb = createClient()
  const qc = useQueryClient()

  // Match the stop's city name against the catalogue cities (already cached
  // under qk.cities) to get the places scope.
  const city = useMemo(
    () =>
      cityName
        ? cities.find((c) => c.city.toLowerCase() === cityName.toLowerCase()) ?? null
        : null,
    [cities, cityName],
  )
  const cityId = city?.id ?? null

  const places = useQuery({
    // -1 = "no catalogue city": resolves to an empty list, custom add still works.
    queryKey: qk.places(cityId ?? -1),
    queryFn: () => (cityId != null ? fetchPlaces(sb, cityId) : Promise.resolve([] as Place[])),
  })

  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Place | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<PlaceKind>('landmark')
  const [rating, setRating] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  // Mock 06's sheet pre-selects "Trip + followers" — check-ins are what the
  // family link exists for; 'trip' stays available for private ones.
  const [visibility, setVisibility] = useState<TripEventVisibility>('followers')

  const addPlace = useMutation({
    mutationFn: () => insertUserPlace(sb, { cityId, name: newName, kind: newKind }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: qk.places(cityId ?? -1) })
      setSel(p) // returns to check-in with this place selected, per the mock
      setAdding(false)
      setNewName('')
    },
  })

  const filtered = useMemo(() => {
    const list = places.data ?? []
    const needle = q.trim().toLowerCase()
    return needle ? list.filter((p) => p.name.toLowerCase().includes(needle)) : list
  }, [places.data, q])

  return (
    <Modal title={`📍 Check in${cityName ? ` — ${cityName}` : ''}`} onClose={onClose}>
      <div className="space-y-4">
        {/* step 1: pick a place */}
        <div>
          <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">
            Step 1 · Where?
          </div>
          <input
            className={input}
            placeholder={cityName ? `🔎 Search places in ${cityName}…` : '🔎 Search places…'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="mt-2 max-h-56 divide-y divide-neutral-200 overflow-y-auto dark:divide-neutral-800">
            {places.isPending && cityId != null && (
              <div className="py-3 text-sm text-neutral-500">Loading places…</div>
            )}
            {!places.isPending && filtered.length === 0 && (
              <div className="py-3 text-sm text-neutral-500">
                {cityId == null
                  ? 'This city isn’t in the catalogue yet — add your place below.'
                  : q
                    ? 'No match — add it below.'
                    : 'No places here yet — add the first one below.'}
              </div>
            )}
            {filtered.map((p) => {
              const selected = sel?.id === p.id
              return (
                <button
                  key={p.id}
                  onClick={() => setSel(selected ? null : p)}
                  className={
                    'flex w-full items-center gap-3 px-2 py-2 text-left ' +
                    (selected
                      ? 'rounded border border-teal-600 bg-teal-50 dark:bg-teal-950/30'
                      : 'hover:bg-neutral-50 dark:hover:bg-neutral-900')
                  }
                >
                  <span className="text-xl">{PLACE_KIND_ICON[p.kind] ?? '📌'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block text-xs text-neutral-500">
                      {p.kind} · {p.source === 'catalogue' ? 'catalogue' : 'community'}
                    </span>
                  </span>
                  {selected && <span className="text-teal-600">✓</span>}
                </button>
              )
            })}
          </div>

          {/* "Add a place here" inline mini-form */}
          {adding ? (
            <div className="mt-2 rounded border border-neutral-200 p-3 dark:border-neutral-800">
              <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">
                ＋ Add a place here
              </div>
              <label className="block text-sm">
                Name
                <input
                  className={input}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
              </label>
              <label className="mt-2 block text-sm">
                Kind
                <select
                  className={input}
                  value={newKind}
                  onChange={(e) => setNewKind(e.target.value as PlaceKind)}
                >
                  {PLACE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {PLACE_KIND_ICON[k]} {k}
                    </option>
                  ))}
                </select>
              </label>
              {addPlace.isError && (
                <div className="mt-2 text-xs text-red-600">
                  Couldn&apos;t save the place — please retry.
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => newName.trim() && addPlace.mutate()}
                  disabled={!newName.trim() || addPlace.isPending}
                  className="rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {addPlace.isPending ? 'Saving…' : 'Save place'}
                </button>
                <button
                  onClick={() => setAdding(false)}
                  className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setAdding(true); setNewName(q.trim()) }}
              className="mt-2 text-sm text-teal-600 hover:underline"
            >
              ＋ Can&apos;t find it? Add a place here
            </button>
          )}
        </div>

        {/* step 2: details — all optional */}
        <div className="border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <div className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
            Step 2 · Details — all optional
          </div>
          <div className="text-sm">Rating</div>
          <div className="mt-1 flex gap-2 text-2xl leading-none">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                onClick={() => setRating(rating === n ? null : n)} // tap again to clear
                className={
                  rating != null && n <= rating
                    ? 'text-amber-500'
                    : 'text-neutral-300 dark:text-neutral-700'
                }
              >
                ★
              </button>
            ))}
          </div>
          <label className="mt-3 block text-sm">
            Comment
            <textarea
              rows={2}
              className={input}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>
          <label className="mt-2 block text-sm">
            Visible to
            <select
              className={input}
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as TripEventVisibility)}
            >
              <option value="trip">🔒 Trip only</option>
              <option value="followers">👨‍👩‍👧 Trip + followers</option>
              <option value="public" disabled>
                🌍 Public — later phase
              </option>
            </select>
          </label>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={() =>
              sel &&
              onSave({ placeId: sel.id, placeName: sel.name, rating, comment, visibility })
            }
            disabled={!sel || saving}
            className="rounded bg-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : sel ? `Check in at ${sel.name}` : 'Pick a place first'}
          </button>
          <button
            onClick={onClose}
            className="rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}
