'use client'
import { useState } from 'react'
import { useMoney } from '@/lib/trips/Money'
import { useToday } from '@/lib/useToday'
import { sourceKey } from '@/lib/trips/importCosts'
import { shortDate } from '@/lib/trips/subscriptions'
import { toBase } from '@/lib/trips/format'
import type { useLedgerMutation } from '@/lib/trips/useLedgerMutation'
import type { useTripMutation } from '@/lib/trips/useTripMutation'
import type { Trip } from '@/lib/trips/types'

// Petra's safeguard for the subscription charges the app writes by itself
// (Patrik, 24 Sep, #37). Each one is announced in the toast's dark pill, but
// it stays until tapped, because it may need an answer: "Cancelled it?"
// asks, in the same pill (Petra, 24 Sep: the question changes where it
// stands instead of a dialog jumping to the top of the screen), and then
// removes the charge and marks the subscription cancelled on that date. So a
// subscription cancelled outside the app, and never marked cancelled in it,
// shows up at its next charge instead of adding money nobody spent. With the
// reminder before each charge, that is a check on either side of it.
//
// One at a time, oldest first. Seen charges are remembered on the device, so
// each traveller sees each charge once, whoever's phone wrote it. Only the
// last 30 days are announced: a cleared browser must not replay a year.
// Editors only, since the answer writes.

const KEY = 'lv-sub-charges-seen'
function readSeen(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function writeSeen(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids.slice(-300)))
  } catch {
    // private mode or storage full: it is announced again next time, no harm
  }
}
const daysBefore = (iso: string, n: number) => new Date(Date.parse(iso) - n * 86_400_000).toISOString().slice(0, 10)

export function ChargeNotice({ trip, canEdit, mut, stateMut }: {
  trip: Trip
  canEdit: boolean
  mut: ReturnType<typeof useLedgerMutation>
  stateMut: ReturnType<typeof useTripMutation>
}) {
  const { fmt } = useMoney()
  // '' on the server and the first client render, like the screens' own date,
  // so the pill never appears in server markup (and never mismatches it).
  const today = useToday()
  const [seen, setSeen] = useState<string[]>(readSeen)
  // The charge whose "Cancelled it?" is being asked; a new charge asks afresh.
  const [asking, setAsking] = useState<string | null>(null)
  if (!canEdit || !today) return null

  const from = daysBefore(today, 30)
  const e = trip.ledger
    .filter((x) => x.source?.kind === 'sub' && x.date >= from && x.date <= today && !seen.includes(x.id))
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  if (!e) return null
  const sub = (trip.state.subscriptions ?? []).find((x) => x.id === e.subId)
  const name = e.note || 'A subscription'
  const amount = fmt(toBase(e.amount, e.currency, trip.state.rates))

  const done = () => {
    const next = [...seen, e.id]
    setSeen(next)
    writeSeen(next)
  }
  function cancelled() {
    const key = sourceKey(e.source!)
    stateMut.mutate(
      (cur) => ({
        ...cur,
        importSkip: [...new Set([...(cur.importSkip ?? []), key])],
        subscriptions: (cur.subscriptions ?? []).map((x) => (x.id === e.subId && !x.cancelledOn ? { ...x, cancelledOn: e.date } : x)),
      }),
      { onSuccess: () => mut.mutate({ kind: 'delete', id: e.id }) },
    )
    done()
  }

  return (
    <div className="fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom))] z-[55] flex justify-center px-[18px]">
      <div role="status" aria-live="polite" className="lv-enter w-full max-w-md rounded-[20px] bg-tx px-4 pb-3 pt-3.5 text-canvas shadow-lg">
        {asking === e.id ? (
          <>
            <p className="text-base leading-snug">
              <b className="font-semibold">Cancelled {name}?</b> This {amount} charge is removed, and {name} is marked
              cancelled from {shortDate(e.date)}, so no more are added.
            </p>
            <div className="mt-2.5 flex justify-end gap-2">
              <button type="button" onClick={() => setAsking(null)} className="min-h-11 rounded-full border-[1.5px] border-canvas/40 px-5 text-base font-semibold">
                No
              </button>
              <button type="button" onClick={cancelled} className="min-h-11 rounded-full bg-canvas px-5 text-base font-semibold text-tx">
                Yes, remove it
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-base leading-snug">
              <b className="font-semibold">{name} · {amount}</b> added to All entries, charged {shortDate(e.date)}.
            </p>
            <div className="mt-2.5 flex justify-end gap-2">
              {sub && !sub.cancelledOn && (
                <button type="button" onClick={() => setAsking(e.id)} className="min-h-11 rounded-full border-[1.5px] border-canvas/40 px-4 text-base font-semibold">
                  Cancelled it?
                </button>
              )}
              <button type="button" onClick={done} className="min-h-11 rounded-full bg-canvas px-5 text-base font-semibold text-tx">
                OK
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
