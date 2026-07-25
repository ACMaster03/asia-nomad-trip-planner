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
}: {
  state: TripState
  fx: FxSnapshot | undefined
  online: boolean
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
    <>
      <h2 className="mb-1 mt-6 text-lg font-semibold">
        FX rates{' '}
        <span className="text-sm font-normal text-neutral-500">
          {base} per 1 unit · updated automatically
        </span>
      </h2>
      <p className="mb-3 text-sm text-neutral-500">
        These come straight from the daily reference feed. They are not editable — one
        mistyped rate would quietly distort every total in the trip.
      </p>

      <div
        className={`mb-3 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${
          failed
            ? 'border-red-400 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
            : stale
              ? 'border-amber-400 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
              : 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900'
        }`}
      >
        <span>
          {!online ? (
            <>📴 Offline — showing the rates saved on this device</>
          ) : failed ? (
            <>Couldn’t reach the rate feed · showing values from <b>{ago(fx?.lastSuccessAt ?? null)}</b></>
          ) : stale ? (
            <>⚠️ Last updated <b>{ago(fx?.lastSuccessAt ?? null)}</b> — totals may have drifted</>
          ) : (
            <>Updated <b>{ago(fx?.lastSuccessAt ?? null)}</b> · next automatic check tonight</>
          )}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={doRefresh}
          disabled={busy || !online}
          className={`rounded px-3 py-1.5 text-sm disabled:opacity-50 ${
            stale || failed
              ? 'bg-teal-600 font-medium text-white'
              : 'border border-neutral-300 dark:border-neutral-700'
          }`}
        >
          {busy ? '↻ Checking…' : failed ? '↻ Try again' : '↻ Refresh now'}
        </button>
      </div>
      {refreshError && (
        <p className="mb-3 text-sm text-amber-600 dark:text-amber-500">{refreshError}</p>
      )}

      <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
              <th className="p-2.5 text-left font-medium">Currency</th>
              <th className="p-2.5 text-right font-medium">{base} per 1 unit</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {watched.map((code) => {
              const live = crossRate(fx?.perUsd ?? {}, code, base)
              const shown = live ?? state.rates[code]
              const reason = autoReasons.get(code)
              const accepted = currencyCountries(code)
              return (
                <tr key={code} className="border-b border-neutral-100 last:border-0 dark:border-neutral-900">
                  <td className="p-2.5">
                    <span className="font-semibold">{code}</span>
                    {code === base && (
                      <span className="ml-2 rounded-full border border-neutral-300 px-2 py-0.5 text-[11px] text-neutral-500 dark:border-neutral-700">
                        base
                      </span>
                    )}
                    {reason && code !== base && (
                      <span className="ml-2 rounded-full border border-teal-500 bg-teal-500/10 px-2 py-0.5 text-[11px] text-teal-700 dark:text-teal-400">
                        auto · {reason}
                      </span>
                    )}
                    {accepted.length > 0 && (
                      <div className="mt-0.5 text-[11px] text-neutral-500">
                        {accepted.length === 1
                          ? accepted[0]
                          : `also legal tender in ${accepted.slice(0, 3).join(', ')}${
                              accepted.length > 3 ? ` +${accepted.length - 3}` : ''
                            }`}
                      </div>
                    )}
                  </td>
                  <td className="p-2.5 text-right tabular-nums">
                    {code === base ? 1 : shown ? shown.toFixed(4) : '—'}
                  </td>
                  <td className="p-2.5 text-right">
                    {code !== base && (
                      <button
                        type="button"
                        onClick={() => removeCurrency(code)}
                        title={`Remove ${code}`}
                        className="text-red-600 hover:opacity-70"
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">
            Add a currency
          </span>
          <select
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            className="rounded border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
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
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-neutral-700"
        >
          ＋ Add
        </button>
      </div>
    </>
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
