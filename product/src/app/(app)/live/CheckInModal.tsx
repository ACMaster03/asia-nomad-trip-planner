'use client'
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin, Send, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchPlaces, insertUserPlace } from '@/lib/catalogue/queries'
import { qk } from '@/lib/catalogue/keys'
import type { Place, CityLite } from '@/lib/catalogue/types'
import type { TripEventVisibility } from '@/lib/trips/events'
import { Sheet } from './Sheet'

const inputCls =
  'mt-[5px] w-full rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 py-3 text-base outline-none transition-colors focus:border-ac'

export type CheckInInput = {
  placeId: string | null
  placeName: string
  rating: number | null
  comment: string
  visibility: TripEventVisibility
  // raw picks — LiveClient compresses + uploads them, then passes storage
  // paths into the outbox mutation (blobs can't ride the offline queue)
  files: File[]
}

// The picked place: a catalogue/user place (id) or a free-text one (id null —
// the pinned city and offline custom adds; the check-in row stores placeName).
type Sel = { placeId: string | null; placeName: string }

const MAX_PHOTOS = 4

// Frame 23 check-in sheet: GPS-first type-ahead. v1 has no GPS/place-guess
// infrastructure, so the pinned one-tap row is the current planned stop city
// (pre-selected — "open → Post" is a valid one-tap check-in), two recency
// chips come from the feed, and "＋ Add as custom place" grows from the typed
// query. Map picker deferred; video post-v1.
export function CheckInModal({
  cityName,
  cities,
  recent,
  online,
  saving,
  onClose,
  onSave,
}: {
  cityName: string | null
  cities: CityLite[]
  // recent check-in place names, newest first (LiveClient derives from feed)
  recent: string[]
  online: boolean
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
    // Keyed by NAME: non-catalogue cities (cityId null) still own user places
    // (migration 14) — they must reappear on every future check-in here.
    queryKey: qk.places(cityName ?? ''),
    queryFn: () =>
      cityName ? fetchPlaces(sb, { cityId, cityName }) : Promise.resolve([] as Place[]),
  })

  const cityPin: Sel | null = cityName ? { placeId: null, placeName: cityName } : null
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Sel | null>(cityPin)
  const [rating, setRating] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [files, setFiles] = useState<File[]>([])
  // Mock 06's sheet pre-selects "Trip + followers" — check-ins are what the
  // family link exists for; the toggle flips down to 'trip' for private ones.
  const [visibility, setVisibility] = useState<TripEventVisibility>('followers')

  const pinActive = !!sel && !!cityPin && sel.placeId === null && sel.placeName === cityPin.placeName

  // "＋ Add as custom place": one tap from the typed query. Online it lands in
  // the catalogue as a source='user' place (so it reappears on future
  // check-ins); offline — or on a failed insert — the typed name is selected
  // as-is: the check-in stores placeName and still queues fine.
  const addCustom = useMutation({
    mutationFn: (name: string) =>
      insertUserPlace(sb, { cityId, cityName: cityName ?? '', name, kind: 'other' }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: qk.places(cityName ?? '') })
      setSel({ placeId: p.id, placeName: p.name })
      setQ('')
    },
  })
  const customPick = () => {
    const name = q.trim()
    if (!name) return
    if (online)
      addCustom.mutate(name, {
        onError: () => {
          setSel({ placeId: null, placeName: name })
          setQ('')
        },
      })
    else {
      setSel({ placeId: null, placeName: name })
      setQ('')
    }
  }

  // Recency chips pick by name; a match in the loaded place list keeps its id.
  const pickByName = (name: string) => {
    const hit = (places.data ?? []).find((p) => p.name.toLowerCase() === name.toLowerCase())
    setSel({ placeId: hit?.id ?? null, placeName: hit?.name ?? name })
    setQ('')
  }

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return []
    return (places.data ?? []).filter((p) => p.name.toLowerCase().includes(needle)).slice(0, 4)
  }, [places.data, q])

  // Up to 2 recent check-in places (never the pinned city); a picked place
  // outside pin + recents shows as the active chip (rig behavior).
  const chips: string[] = []
  const seen = new Set<string>()
  for (const name of recent) {
    const k = name.toLowerCase()
    if (cityPin && k === cityPin.placeName.toLowerCase()) continue
    if (seen.has(k)) continue
    seen.add(k)
    chips.push(name)
    if (chips.length === 2) break
  }
  if (sel && !pinActive && !seen.has(sel.placeName.toLowerCase())) chips.unshift(sel.placeName)

  return (
    <Sheet label="Check in" onClose={onClose}>
      <div className="flex items-center gap-2 font-serif text-[21px] font-semibold">
        <MapPin aria-hidden className="size-5 flex-none" strokeWidth={2} /> Check in
      </div>

      {/* where — pinned stop, type-ahead, recency chips, custom add */}
      <div>
        <div className="text-base font-medium text-tx2">
          Where are you?{cityName ? ` · ${cityName}` : ''}
        </div>
        {cityPin && (
          <button
            onClick={() => {
              setSel(cityPin)
              setQ('')
            }}
            className={
              'mt-[6px] flex w-full items-center gap-2.5 rounded-[calc(var(--r)-3px)] border-[1.5px] bg-inp px-3 py-3 text-left transition-colors ' +
              (pinActive ? 'border-ac' : 'border-ln2')
            }
          >
            <Send aria-hidden className="size-[18px] flex-none" strokeWidth={2} />
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold">{cityPin.placeName}</span>
              <span className="mt-px block text-base text-tx3">Current stop on your plan</span>
            </span>
            {pinActive && <span className="flex-none text-base font-semibold text-ac">✓</span>}
          </button>
        )}
        <input
          className={inputCls + ' mt-[7px]'}
          placeholder="Type to search places…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q.trim() ? (
          <div className="mt-[7px] rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3">
            {places.isPending && cityName && (
              <div className="border-b border-ln py-3 text-base text-tx3">Loading places…</div>
            )}
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setSel({ placeId: p.id, placeName: p.name })
                  setQ('')
                }}
                className="flex w-full items-center gap-2.5 border-b border-ln py-3 text-left"
              >
                <span className="min-w-0 flex-1 truncate text-base font-medium">{p.name}</span>
                <span className="flex-none text-base text-tx3">
                  {p.kind} · {p.source === 'catalogue' ? 'catalogue' : 'yours'}
                </span>
              </button>
            ))}
            <button
              onClick={customPick}
              disabled={addCustom.isPending}
              className="flex w-full py-3 text-left text-base font-medium text-ac2-deep disabled:opacity-50"
            >
              {addCustom.isPending ? 'Adding…' : `＋ Add "${q.trim()}" · custom place`}
            </button>
          </div>
        ) : (
          chips.length > 0 && (
            <div className="mt-[9px] flex flex-wrap gap-[7px]">
              {chips.map((c) => {
                const active = !!sel && sel.placeName.toLowerCase() === c.toLowerCase()
                return (
                  <button
                    key={c}
                    onClick={() => pickByName(c)}
                    className={
                      'rounded-full px-3 py-2 text-base font-medium transition-colors ' +
                      (active ? 'bg-ac2 text-on' : 'bg-tag text-tag-ink')
                    }
                  >
                    {c}
                  </button>
                )
              })}
            </div>
          )
        )}
      </div>

      {/* rating — pick pop via scale pulse */}
      <div>
        <div className="text-base font-medium text-tx2">Rating · optional</div>
        <div className="mt-1 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              onClick={() => setRating(rating === n ? null : n)} // tap again to clear
              className={
                'px-1 text-[30px] leading-none transition-[color,transform] duration-150 ease-out ' +
                (rating != null && n <= rating ? 'scale-[1.12] text-warn' : 'text-ln3')
              }
            >
              ★
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="text-base font-medium text-tx2">Comment · optional</span>
        <textarea
          rows={2}
          className={inputCls}
          placeholder="How was it?"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </label>

      {/* photos */}
      <div>
        <div className="text-base font-medium text-tx2">
          Photos · {files.length} of {MAX_PHOTOS}
        </div>
        <div className="mt-[7px] flex flex-wrap items-center gap-[9px]">
          {files.map((f, i) => (
            <span key={i} className="relative">
              {/* object URLs are tiny previews; revoked on unmount is skipped
                  on purpose — the sheet is short-lived */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={URL.createObjectURL(f)}
                alt=""
                className="h-16 w-16 rounded-[calc(var(--r)-2px)] object-cover"
              />
              <button
                aria-label="Remove photo"
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
                className="absolute -right-1.5 -top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-ac2 text-on"
              >
                <X className="size-3.5" strokeWidth={2} />
              </button>
            </span>
          ))}
          {files.length < MAX_PHOTOS && (
            <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-[calc(var(--r)-2px)] bg-ph text-xl text-tx2">
              ＋
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const picked = [...(e.target.files ?? [])]
                  setFiles([...files, ...picked].slice(0, MAX_PHOTOS))
                  e.target.value = ''
                }}
              />
            </label>
          )}
        </div>
        <p className="mt-[7px] text-base leading-snug text-tx3">
          Compressed on your phone before upload. Photos need signal - offline check-ins post
          without them.
        </p>
      </div>

      {/* share toggle → visibility field ('followers' on / 'trip' off) */}
      <button
        onClick={() => setVisibility(visibility === 'followers' ? 'trip' : 'followers')}
        className="flex items-center gap-[9px] text-left text-base text-tx2"
      >
        <span
          aria-hidden
          className={
            'flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] text-[13px] font-semibold transition-colors ' +
            (visibility === 'followers' ? 'bg-ac text-on' : 'border-[1.5px] border-ln3')
          }
        >
          {visibility === 'followers' ? '✓' : ''}
        </span>
        Share with followers
      </button>

      <button
        onClick={() =>
          sel &&
          onSave({ placeId: sel.placeId, placeName: sel.placeName, rating, comment, visibility, files })
        }
        disabled={!sel || saving}
        className={
          'w-full rounded-[var(--r)] py-4 text-[17px] font-semibold text-on transition-colors disabled:opacity-50 ' +
          (online ? 'bg-ac' : 'bg-warn')
        }
      >
        {saving ? 'Saving…' : !sel ? 'Pick a place first' : online ? 'Post check-in' : 'Post - will queue offline'}
      </button>
    </Sheet>
  )
}
