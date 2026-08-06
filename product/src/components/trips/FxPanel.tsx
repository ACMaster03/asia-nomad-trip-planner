'use client'
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { crossRate, isStale, refreshFx, type FxSnapshot } from '@/lib/catalogue/fx'
import { qk } from '@/lib/catalogue/keys'
import { countryCurrencies, currencyCountries, COUNTRY_CURRENCIES } from '@/lib/catalogue/countryCurrencies'
import type { TripState } from '@/lib/trips/types'

// Approved endframe: mock 12. Rates are READ-ONLY — owner decision 2026-07-25,
// "one bad manual input can mess up trip planning while the data should be
// correct in all cases". The only controls are which currencies to watch and
// when to re-fetch. The database backs this up: fx_rates has no write policy.

function ago(iso: string | null): string {
  if (!iso) return 'never'
  const mins = Math.max(0, Math.round((Date.now() - +new Date(iso)) / 60_000))
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const h = Math.round(mins / 60)
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`
  return `${Math.round(h / 24)} days ago`
}

/** Currencies implied by the countries on the route, with their reason. */
export function itineraryCurrencies(state: TripState): Map<string, string> {
  const out = new Map<string, string>()
  for (const seg of state.segments ?? []) {
    if (seg.include === false) continue
    for (const code of countryCurrencies(seg.country)) {
      if (!out.has(code)) out.set(code, seg.country)
    }
  }
  return out
}

export default function FxPanel({
  state,
  fx,
  online,
  // Viewers see the rates (they total the trip they're looking at) but cannot
  // change WHICH currencies the trip watches — that edits trips.state.
  canEdit = true,
}: {
  state: TripState
  fx: FxSnapshot | undefined
  online: boolean
  canEdit?: boolean
}) {
  const sb = createClient()
  const qc = useQueryClient()
  const mut = useTripMutation()
  const [busy, setBusy] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [adding, setAdding] = useState('')

  const base = state.meta?.baseCurrency || 'HUF'
  const watched = useMemo(
    () => Object.keys(state.rates ?? {}).sort((a, b) => (a === base ? -1 : b === base ? 1 : a.localeCompare(b))),
    [state.rates, base],
  )
  const autoReasons = useMemo(() => itineraryCurrencies(state), [state])

  const stale = isStale(fx?.lastSuccessAt ?? null)
  const failed = !!fx?.lastError

  async function doRefresh() {
    setBusy(true)
    setRefreshError(null)
    const r = await refreshFx(sb)
    if (!r.ok) setRefreshError(r.error ?? 'refresh failed')
    await qc.invalidateQueries({ queryKey: qk.fx })
    setBusy(false)
  }

  function addCurrency(code: string) {
    const c = code.trim().toUpperCase()
    if (!c || watched.includes(c)) return
    mut.mutate((s) => ({
      ...s,
      // Seed with the live value so an offline launch has something real.
      rates: { ...s.rates, [c]: crossRate(fx?.perUsd ?? {}, c, base) ?? 0 },
      meta: { ...s.meta, fxDismissed: (s.meta.fxDismissed ?? []).filter((x) => x !== c) },
    }))
    setAdding('')
  }

  function removeCurrency(code: string) {
    // Zeroing a rate that rows still reference would silently wipe their totals,
    // so refuse rather than "helpfully" removing it.
    const used = countUses(state, code)
    if (used > 0) {
      alert(`${used} ${used === 1 ? 'entry' : 'entries'} still use ${code}. Change or delete them first.`)
      return
    }
    mut.mutate((s) => {
      const rates = { ...s.rates }
      delete rates[code]
      return {
        ...s,
        rates,
        // Remembered, so auto-add never resurrects it while the country is on the route.
        meta: { ...s.meta, fxDismissed: [...new Set([...(s.meta.fxDismissed ?? []), code])] },
      }
    })
  }

  const addable = useMemo(() => {
    const all = new Set<string>()
    for (const codes of Object.values(COUNTRY_CURRENCIES)) for (const c of codes) all.add(c)
    return [...all].filter((c) => !watched.includes(c)).sort()
  }, [watched])

  return (
    <section className="rounded-[var(--r)] bg-sf p-4">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 className="font-serif text-[19px] font-semibold">FX rates</h2>
        <span
          className={`rounded-full border-[1.4px] px-2.5 py-[3px] text-base font-medium ${
            failed
              ? 'border-ac2-line text-ac2'
              : stale
                ? 'border-warn-line text-warn'
                : 'border-ac text-tx2'
          }`}
        >
          updated {ago(fx?.lastSuccessAt ?? null)}
        </span>
      </div>
      <p className="mt-[7px] text-base leading-normal text-tx2">
        Updated daily and read-only — one mistyped rate would quietly distort every total in the
        trip. A currency appears here as soon as a stop needs it. All figures are {base} per 1 unit.
      </p>

      {(!online || failed || stale) && (
        <div
          className={`mt-3 flex flex-wrap items-center gap-3 rounded-[calc(var(--r)-3px)] border-[1.5px] px-3 py-2.5 text-base ${
            failed ? 'border-ac2-line bg-ac2-soft' : 'border-warn-line bg-warn-soft'
          }`}
        >
          <span className="leading-normal">
            {!online ? (
              <>Offline — showing the rates saved on this device</>
            ) : failed ? (
              <>Couldn’t reach the rate feed · showing values from <b>{ago(fx?.lastSuccessAt ?? null)}</b></>
            ) : (
              <>Last updated <b>{ago(fx?.lastSuccessAt ?? null)}</b> — totals may have drifted</>
            )}
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={doRefresh}
        disabled={busy || !online}
        className={`mt-3 rounded-[calc(var(--r)-3px)] px-4 py-3 text-base font-semibold disabled:opacity-50 ${
          stale || failed
            ? 'bg-ac text-on'
            : 'border-[1.5px] border-ln3 text-tx2'
        }`}
      >
        {busy ? '↻ Checking…' : failed ? '↻ Try again' : '↻ Refresh now'}
      </button>
      {refreshError && <p className="mt-2 text-base text-warn">{refreshError}</p>}

      <div className="mt-3 flex flex-col">
        {watched.map((code, i) => {
          const live = crossRate(fx?.perUsd ?? {}, code, base)
          const shown = live ?? state.rates[code]
          const reason = autoReasons.get(code)
          const accepted = currencyCountries(code)
          return (
            <div
              key={code}
              className={'flex items-center gap-2.5 py-[9px]' + (i < watched.length - 1 ? ' border-b border-ln' : '')}
            >
              <div className="min-w-0 flex-1 text-base">
                <span className="font-semibold">{code}</span>
                {accepted.length > 0 && (
                  <span className="text-tx2">
                    {' · '}
                    {accepted.length === 1
                      ? accepted[0]
                      : `${accepted[0]} +${accepted.length - 1}`}
                  </span>
                )}
                {code === base && (
                  <span className="ml-2 rounded-full border-[1.4px] border-ln3 px-2 py-[1px] text-base text-tx2">
                    base
                  </span>
                )}
                {reason && code !== base && (
                  <span className="ml-2 rounded-full border-[1.4px] border-ac-line bg-ac-soft px-2 py-[1px] text-base text-tx2">
                    auto · {reason}
                  </span>
                )}
              </div>
              <span className="text-base tabular-nums">
                {code === base ? 1 : shown ? shown.toFixed(4) : '—'}
              </span>
              {canEdit && code !== base && (
                <button
                  type="button"
                  onClick={() => removeCurrency(code)}
                  title={`Remove ${code}`}
                  className="text-base text-ac2 hover:opacity-70"
                >
                  ✕
                </button>
              )}
            </div>
          )
        })}
      </div>

      {canEdit && (
        <div className="mt-[13px] flex flex-wrap items-end gap-2.5">
          <label className="block grow text-base font-medium text-tx2">
            Add a currency
            <select
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              className="mt-[5px] w-full rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 py-3 text-base focus:border-ac focus:outline-none"
            >
              <option value="">Search {addable.length} currencies…</option>
              {addable.map((c) => (
                <option key={c} value={c}>
                  {c}
                  {currencyCountries(c).length ? ` — ${currencyCountries(c)[0]}` : ''}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!adding}
            onClick={() => addCurrency(adding)}
            className="rounded-[calc(var(--r)-3px)] border-[1.5px] border-ac2 px-4 py-3 text-base font-semibold text-ac2 disabled:opacity-50"
          >
            ＋ Add
          </button>
        </div>
      )}
    </section>
  )
}

/** Rows that would lose their converted total if this currency vanished. */
function countUses(s: TripState, code: string): number {
  let n = 0
  for (const x of s.stays ?? []) if (x.cur === code) n++
  for (const x of s.transport ?? []) if (x.cur === code) n++
  for (const x of s.extras ?? []) if (x.cur === code) n++
  return n
}
