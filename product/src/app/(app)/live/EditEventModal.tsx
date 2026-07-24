'use client'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { onlineManager } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { tk } from '@/lib/trips/keys'
import {
  updateCheckInDetails,
  updateTripEvent,
  type TripEvent,
  type TripEventVisibility,
} from '@/lib/trips/events'
import { publicMediaUrl, uploadCheckinPhotos } from '@/lib/trips/media'
import { Modal } from '@/components/trips/Modal'

// Edit your own past event (owner request 2026-07-24: revise a rating after
// the restaurant "votes", fix a name, attach the photos you forgot). Edits
// are ONLINE-ONLY on purpose — inserts stay the outbox's only offline path.

const input =
  'mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900'

const MAX_PHOTOS = 4

// New photo indices must clear the existing ones (removals leave gaps, so
// count alone is not enough).
function nextPhotoIndex(paths: string[]): number {
  let max = -1
  for (const p of paths) {
    const m = /\/(\d+)\.jpg$/.exec(p)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max + 1
}

export function EditEventModal({
  ev,
  tripId,
  onClose,
}: {
  ev: TripEvent
  tripId: string
  onClose: () => void
}) {
  const sb = createClient()
  const qc = useQueryClient()

  const [placeName, setPlaceName] = useState(
    typeof ev.payload.placeName === 'string' ? ev.payload.placeName : '',
  )
  const [noteText, setNoteText] = useState(
    typeof ev.payload.text === 'string' ? ev.payload.text : '',
  )
  const [city, setCity] = useState(typeof ev.payload.city === 'string' ? ev.payload.city : '')
  const [rating, setRating] = useState<number | null>(ev.check_in?.rating ?? null)
  const [comment, setComment] = useState(ev.check_in?.comment ?? '')
  const [visibility, setVisibility] = useState<TripEventVisibility>(ev.visibility)
  const [photos, setPhotos] = useState<string[]>(
    Array.isArray(ev.payload.photos) ? (ev.payload.photos as string[]) : [],
  )
  const [newFiles, setNewFiles] = useState<File[]>([])

  const save = useMutation({
    mutationFn: async () => {
      if (!onlineManager.isOnline()) throw new Error('Editing needs a connection.')
      let allPhotos = photos
      if (newFiles.length) {
        const uploaded = await uploadCheckinPhotos(
          sb, tripId, ev.id, newFiles, nextPhotoIndex(photos),
        )
        allPhotos = [...photos, ...uploaded]
      }
      const payload: Record<string, unknown> = { ...ev.payload }
      if (ev.kind === 'checkin') {
        payload.placeName = placeName.trim() || (ev.payload.placeName as string)
        if (allPhotos.length) payload.photos = allPhotos
        else delete payload.photos
      }
      if (ev.kind === 'note') payload.text = noteText.trim() || (ev.payload.text as string)
      if (ev.kind === 'arrived') payload.city = city.trim() || (ev.payload.city as string)
      await updateTripEvent(sb, { id: ev.id, payload, visibility })
      if (ev.kind === 'checkin') {
        await updateCheckInDetails(sb, { eventId: ev.id, rating, comment })
      }
      // removed photos: best-effort storage cleanup (payload no longer lists
      // them, so worst case is an unreachable orphan)
      const removed = (
        Array.isArray(ev.payload.photos) ? (ev.payload.photos as string[]) : []
      ).filter((p) => !photos.includes(p))
      if (removed.length) await sb.storage.from('trip-media').remove(removed)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tk.events(tripId) })
      onClose()
    },
  })

  return (
    <Modal title={`✏️ Edit ${ev.kind === 'checkin' ? 'check-in' : ev.kind}`} onClose={onClose}>
      <div className="space-y-3">
        {ev.kind === 'checkin' && (
          <>
            <label className="block text-sm">
              Place name
              <input className={input} value={placeName} onChange={(e) => setPlaceName(e.target.value)} />
            </label>
            <div className="text-sm">Rating</div>
            <div className="flex gap-2 text-2xl leading-none">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  aria-label={`${n} star${n > 1 ? 's' : ''}`}
                  onClick={() => setRating(rating === n ? null : n)}
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
            <label className="block text-sm">
              Comment
              <textarea rows={2} className={input} value={comment} onChange={(e) => setComment(e.target.value)} />
            </label>
            <div className="text-sm">Photos</div>
            <div className="flex flex-wrap items-center gap-2">
              {photos.map((p) => (
                <span key={p} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={publicMediaUrl(p)} alt="" className="h-14 w-14 rounded object-cover" />
                  <button
                    aria-label="Remove photo"
                    onClick={() => setPhotos(photos.filter((x) => x !== p))}
                    className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-neutral-800 text-[10px] leading-none text-white"
                  >
                    ×
                  </button>
                </span>
              ))}
              {newFiles.map((f, i) => (
                <span key={`new-${i}`} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={URL.createObjectURL(f)} alt="" className="h-14 w-14 rounded object-cover opacity-80" />
                  <button
                    aria-label="Remove new photo"
                    onClick={() => setNewFiles(newFiles.filter((_, j) => j !== i))}
                    className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-neutral-800 text-[10px] leading-none text-white"
                  >
                    ×
                  </button>
                </span>
              ))}
              {photos.length + newFiles.length < MAX_PHOTOS && (
                <label className="flex h-14 w-14 cursor-pointer items-center justify-center rounded border border-dashed border-neutral-300 text-xl text-neutral-400 dark:border-neutral-700">
                  ＋
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const picked = [...(e.target.files ?? [])]
                      setNewFiles(
                        [...newFiles, ...picked].slice(0, MAX_PHOTOS - photos.length),
                      )
                      e.target.value = ''
                    }}
                  />
                </label>
              )}
            </div>
          </>
        )}
        {ev.kind === 'note' && (
          <label className="block text-sm">
            Note
            <textarea rows={3} className={input} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
          </label>
        )}
        {ev.kind === 'arrived' && (
          <label className="block text-sm">
            City
            <input className={input} value={city} onChange={(e) => setCity(e.target.value)} />
          </label>
        )}
        <label className="block text-sm">
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
        {save.isError && (
          <p className="text-sm text-red-600">
            Couldn&apos;t save: {(save.error as Error)?.message ?? 'unknown error'}
          </p>
        )}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
          <button
            onClick={onClose}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}
