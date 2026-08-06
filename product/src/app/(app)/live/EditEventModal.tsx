'use client'
import { useState } from 'react'
import { useMutation, useQueryClient, onlineManager } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { tk } from '@/lib/trips/keys'
import { updateCheckInDetails, updateTripEvent, type TripEvent } from '@/lib/trips/events'
import { publicMediaUrl, uploadCheckinPhotos } from '@/lib/trips/media'
import { Sheet } from './Sheet'

// Edit your own past event (owner request 2026-07-24: revise a rating after
// the restaurant "votes", attach the photos you forgot). Edits are ONLINE-ONLY
// on purpose — inserts stay the outbox's only offline path.
//
// LIVHOLD rule (handoff README, frame 08c): "Edit keeps place/time fixed -
// only your words change." Place + time render read-only; only rating, note
// and photos are editable. Payload place fields and visibility pass through
// untouched.

const inputCls =
  'mt-[5px] w-full rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 py-3 text-base outline-none transition-colors focus:border-ac'

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

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

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

  const [noteText, setNoteText] = useState(
    typeof ev.payload.text === 'string' ? ev.payload.text : '',
  )
  const [rating, setRating] = useState<number | null>(ev.check_in?.rating ?? null)
  const [comment, setComment] = useState(ev.check_in?.comment ?? '')
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
      // Place/time fields (placeName, city, occurred_at) are copied through
      // untouched — only words, rating and photos may differ from the original.
      const payload: Record<string, unknown> = { ...ev.payload }
      if (ev.kind === 'checkin') {
        if (allPhotos.length) payload.photos = allPhotos
        else delete payload.photos
      }
      if (ev.kind === 'note') payload.text = noteText.trim() || (ev.payload.text as string)
      await updateTripEvent(sb, { id: ev.id, payload, visibility: ev.visibility })
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

  const headline =
    ev.kind === 'checkin'
      ? typeof ev.payload.placeName === 'string'
        ? ev.payload.placeName
        : 'Check-in'
      : ev.kind === 'arrived'
        ? `Arrived${typeof ev.payload.city === 'string' ? ` in ${ev.payload.city}` : ''}`
        : 'Note'

  return (
    <Sheet
      label={`Edit ${ev.kind === 'checkin' ? 'check-in' : ev.kind}`}
      onClose={onClose}
    >
      <div className="font-serif text-[21px] font-semibold">
        Edit {ev.kind === 'checkin' ? 'check-in' : ev.kind === 'note' ? 'note' : 'entry'}
      </div>

      {/* place + time: read-only, always */}
      <div>
        <div className="text-base font-semibold">{headline}</div>
        <div className="mt-[3px] text-base text-tx3">
          {fmtWhen(ev.occurred_at)} · place and time stay as they were - only your words change.
        </div>
      </div>

      {ev.kind === 'checkin' && (
        <>
          <div>
            <div className="text-base font-medium text-tx2">Rating</div>
            <div className="mt-1 flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  aria-label={`${n} star${n > 1 ? 's' : ''}`}
                  onClick={() => setRating(rating === n ? null : n)}
                  className={
                    'px-1 text-[26px] leading-none transition-[color,transform] duration-150 ease-out ' +
                    (rating != null && n <= rating ? 'scale-[1.1] text-warn' : 'text-ln3')
                  }
                >
                  ★
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-base font-medium text-tx2">Note</span>
            <textarea
              rows={2}
              className={inputCls}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>
          <div>
            <div className="text-base font-medium text-tx2">
              Photos · {photos.length + newFiles.length} of {MAX_PHOTOS}
            </div>
            <div className="mt-[7px] flex flex-wrap items-center gap-[9px]">
              {photos.map((p) => (
                <span key={p} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={publicMediaUrl(p)}
                    alt=""
                    className="h-16 w-16 rounded-[calc(var(--r)-2px)] object-cover"
                  />
                  <button
                    aria-label="Remove photo"
                    onClick={() => setPhotos(photos.filter((x) => x !== p))}
                    className="absolute -right-1.5 -top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-ac2 text-on"
                  >
                    <X className="size-3.5" strokeWidth={2} />
                  </button>
                </span>
              ))}
              {newFiles.map((f, i) => (
                <span key={`new-${i}`} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={URL.createObjectURL(f)}
                    alt=""
                    className="h-16 w-16 rounded-[calc(var(--r)-2px)] object-cover opacity-80"
                  />
                  <button
                    aria-label="Remove new photo"
                    onClick={() => setNewFiles(newFiles.filter((_, j) => j !== i))}
                    className="absolute -right-1.5 -top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-ac2 text-on"
                  >
                    <X className="size-3.5" strokeWidth={2} />
                  </button>
                </span>
              ))}
              {photos.length + newFiles.length < MAX_PHOTOS && (
                <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-[calc(var(--r)-2px)] border-[1.5px] border-dashed border-ln3">
                  <span className="text-xl leading-none text-ac2">＋</span>
                  <span className="text-[13px] font-medium text-tx2">Add</span>
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
            <p className="mt-[7px] text-base leading-snug text-tx3">
              Removed photos disappear for followers too. New ones upload when there&apos;s
              signal.
            </p>
          </div>
        </>
      )}

      {ev.kind === 'note' && (
        <label className="block">
          <span className="text-base font-medium text-tx2">Note</span>
          <textarea
            rows={3}
            className={inputCls}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />
        </label>
      )}

      {save.isError && (
        <p className="rounded-[calc(var(--r)-3px)] border-[1.5px] border-warn-line bg-warn-soft px-3 py-2 text-base text-warn">
          Couldn&apos;t save: {(save.error as Error)?.message ?? 'unknown error'}
        </p>
      )}

      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="w-full rounded-[calc(var(--r)-2px)] bg-ac py-3.5 text-base font-semibold text-on disabled:opacity-50"
      >
        {save.isPending ? 'Saving…' : 'Save changes'}
      </button>
    </Sheet>
  )
}
