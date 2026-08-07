'use client'
import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { useTripRole } from '@/lib/trips/useTripRole'
import { countryCurrencies } from '@/lib/catalogue/countryCurrencies'
import type { TripState } from '@/lib/trips/types'

// Approved endframe: mock 12, "Itinerary banner". When a stop lands in a
// country new to the plan, its currencies join the watchlist and this says so
// once — dismissible, linking to the FX panel.
//
// Offline-safe: the country -> currency map is a vendored constant, so no
// network is needed to know WHAT to add. The rate VALUES arrive with the next
// successful fetch; until then the row shows a dash rather than a wrong number.
//
// The message lives in meta.fxLastAdded, written by the SAME mutation that adds
// the currencies. That keeps the banner a pure function of the document — it
// survives a reload, needs no local state, and no effect ever calls setState.
//
// A country only banners if it actually contributed something: on the very
// first load after this shipped, every existing country is silently marked seen
// rather than firing a banner apiece for currencies already on the watchlist.

/** Currencies this country would add that aren't already watched or dismissed. */
function newCurrenciesFor(state: TripState, country: string): string[] {
  const dismissed = new Set(state.meta?.fxDismissed ?? [])
  const watched = new Set(Object.keys(state.rates ?? {}))
  return countryCurrencies(country).filter((c) => !dismissed.has(c) && !watched.has(c))
}

/** First country on the route not yet acknowledged, with whatever it adds. */
function nextUnseen(state: TripState): { country: string; codes: string[] } | null {
  const seen = new Set(state.meta?.fxSeenCountries ?? [])
  for (const seg of state.segments ?? []) {
    if (seg.include === false || !seg.country || seen.has(seg.country)) continue
    return { country: seg.country, codes: newCurrenciesFor(state, seg.country) }
  }
  return null
}

export default function NewCountryBanner({ state }: { state: TripState }) {
  const mut = useTripMutation()
  const { canEdit } = useTripRole()
  const handled = useRef<string | null>(null)

  const pending = nextUnseen(state)
  const announced = state.meta?.fxLastAdded

  // Side effect only — the ref stops a re-render from repeating the write while
  // the mutation is still in flight.
  useEffect(() => {
    // Viewers must not trigger it: the write would fail against RLS, and the
    // watchlist isn't theirs to extend. They still see the resulting rates.
    if (!canEdit) return
    if (!pending || handled.current === pending.country) return
    handled.current = pending.country
    const { country, codes } = pending
    mut.mutate((s) => {
      const rates = { ...s.rates }
      for (const c of codes) if (!(c in rates)) rates[c] = 0 // real value lands on the next fetch
      return {
        ...s,
        rates,
        meta: {
          ...s.meta,
          fxSeenCountries: [...new Set([...(s.meta.fxSeenCountries ?? []), country])],
          // Only announce when something was actually added.
          ...(codes.length > 0 ? { fxLastAdded: { country, codes } } : {}),
        },
      }
    })
  }, [pending, mut, canEdit])

  if (!canEdit) return null
  if (!announced || announced.codes.length === 0) return null

  return (
    <div className="lv-enter mb-4 flex items-start gap-3 rounded-[var(--rCtl)] border border-l-4 border-ln2 border-l-ac bg-sf px-3.5 py-3 text-base text-tx">
      <span>
        <b>{announced.country} is new on your route</b> — {announced.codes.join(' and ')}{' '}
        {announced.codes.length === 1 ? 'was' : 'were'} added to your FX watchlist.{' '}
        <Link href="/settings" className="font-medium text-ac2-deep underline">
          View in Settings
        </Link>
      </span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() =>
          mut.mutate((s) => {
            const meta = { ...s.meta }
            delete meta.fxLastAdded
            return { ...s, meta }
          })
        }
        className="ml-auto flex h-8 w-8 flex-none items-center justify-center rounded-full border border-ln2 text-tx3"
      >
        ✕
      </button>
    </div>
  )
}
