'use client'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { useToast } from '@/components/Toast'
import { useMoney } from '@/lib/trips/Money'
import { useTripScope } from '@/lib/trips/TripScope'
import { tk } from '@/lib/trips/keys'
import { acceptOffer, dismissOffer, everyOf, offerLinks, type OfferAnswers, type OfferRow } from '@/lib/trips/subsOffer'
import type { useLedgerMutation } from '@/lib/trips/useLedgerMutation'
import type { useTripMutation } from '@/lib/trips/useTripMutation'
import type { Trip } from '@/lib/trips/types'

// The one-time offer on Money (mock 16 §8, round 3b): the entries already in
// Subscriptions that no subscription covers, one row per name, each set to
// Every month until changed. Add declares them all at once; No thanks puts the
// card away for good, and each entry still gets the question when opened (§7).
// The mock's "Not now" became "No thanks": the card never comes back, and "not
// now" promised that it would.
//
// Since round 3a a declared subscription writes its own charges into All
// entries, so the card says so before anyone adds five of them at once, and
// says from when: today (lib/trips/subsOffer.ts).
const CADENCES = [
  { months: 1, label: 'Every month' },
  { months: 3, label: 'Every 3 months' },
  { months: 6, label: 'Every 6 months' },
  { months: 12, label: 'Every year' },
  { months: 0, label: 'Doesn’t repeat' },
]
const newId = () => 'sub' + crypto.randomUUID()

export function SubsOffer({ rows, todayIso, mut, stateMut, className = '' }: {
  rows: OfferRow[]
  todayIso: string
  mut: ReturnType<typeof useLedgerMutation>
  stateMut: ReturnType<typeof useTripMutation>
  className?: string
}) {
  const { fmt, base } = useMoney()
  const toast = useToast()
  const qc = useQueryClient()
  const { tripId } = useTripScope()
  const [answers, setAnswers] = useState<OfferAnswers>({})
  const adding = rows.filter((r) => everyOf(answers, r.key) > 0).length
  const entries = rows.reduce((n, r) => n + r.ids.length, 0)
  const year = todayIso.slice(0, 4)
  const when = (iso: string) =>
    new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(iso.slice(0, 4) !== year ? { year: 'numeric' } : {}) })

  function add() {
    let made: Map<string, string> | null = null
    stateMut.mutate(
      (cur) => {
        const r = acceptOffer(cur, rows, answers, todayIso, newId)
        made = r.made
        return r.next
      },
      {
        // Linked after the subscriptions are saved, from the entries as they
        // are now: an entry answered in the meantime keeps its answer.
        onSuccess: () => {
          if (!made) return
          const ledger = qc.getQueryData<Trip>(tk.trip(tripId ?? 'none'))?.ledger ?? []
          for (const { id, subId } of offerLinks(rows, answers, made)) {
            const entry = ledger.find((e) => e.id === id)
            if (entry && entry.subId === undefined) mut.mutate({ kind: 'upsert', entry: { ...entry, subId } })
          }
        },
      },
    )
    toast(adding ? `${adding} ${adding === 1 ? 'subscription' : 'subscriptions'} added` : 'Saved')
  }

  return (
    <section aria-labelledby="subs-offer" className={'lv-enter rounded-[var(--r)] border-[1.5px] border-ac2-line bg-sf px-[18px] ' + className}>
      <div className="border-b border-ln pb-2.5 pt-3">
        <div className="text-[12px] font-semibold uppercase tracking-[.11em] text-ac2-deep">Subscriptions</div>
        <h2 id="subs-offer" className="mt-0.5 font-serif text-[18px] font-semibold leading-snug">
          {entries} {entries === 1 ? 'entry looks like a subscription' : 'entries look like subscriptions'}
        </h2>
        <p className="mt-0.5 text-[14px] leading-snug text-tx2">
          Say how often each one charges. From today on, each charge is added to All entries by itself.
        </p>
      </div>
      {rows.map((r) => {
        const e = r.latest
        const name = e.note.trim()
        return (
          <div key={r.key} className="flex items-center justify-between gap-3 border-b border-ln py-2.5">
            <span className="min-w-0">
              <span className="block text-base font-semibold">{name}</span>
              <span className="block text-[14px] text-tx2">
                {e.currency === base ? fmt(e.amount) : `${e.amount.toLocaleString('en-US')} ${e.currency}`}
                {' · '}{when(e.date)}{r.ids.length > 1 ? ` · ${r.ids.length} entries` : ''}
              </span>
            </span>
            <span className="relative flex-none">
              <select
                aria-label={`How often ${name} charges`}
                value={everyOf(answers, r.key)}
                onChange={(ev) => setAnswers((a) => ({ ...a, [r.key]: Number(ev.target.value) }))}
                className={'min-h-11 appearance-none rounded-full border-[1.5px] py-[7px] pl-3 pr-8 text-[14px] font-medium outline-none focus:border-ac '
                  + (everyOf(answers, r.key) > 0 ? 'border-ln2 bg-sf text-tx' : 'border-dashed border-ln2 bg-inp text-tx2')}
              >
                {CADENCES.map((c) => <option key={c.months} value={c.months}>{c.label}</option>)}
              </select>
              <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-tx3" />
            </span>
          </div>
        )
      })}
      {/* One above the other: side by side, as in the mock, "Add 4
          subscriptions" broke onto two lines at phone width. The second
          button is text, like Mark cancelled on the subscription form. */}
      <div className="pt-3">
        <button
          type="button"
          onClick={add}
          disabled={stateMut.isPending}
          className="min-h-11 w-full rounded-[var(--rCtl)] bg-ac px-4 py-3 text-base font-semibold text-on disabled:opacity-50"
        >
          {adding ? `Add ${adding} ${adding === 1 ? 'subscription' : 'subscriptions'}` : 'Save'}
        </button>
        <p className="pt-2 text-center text-[13px] leading-snug text-tx2">
          {adding
            ? 'Reminders on, 3 days before each charge. Change any of them on the Subscriptions card.'
            : 'None of these repeat, so nothing is added.'}
        </p>
        <button
          type="button"
          onClick={() => stateMut.mutate((cur) => dismissOffer(cur, todayIso))}
          disabled={stateMut.isPending}
          className="mt-1 min-h-11 w-full pb-1 text-center text-base font-semibold text-ac2-deep disabled:opacity-50"
        >
          No thanks
        </button>
      </div>
    </section>
  )
}
