'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Plus, X } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Sheet } from '@/app/(app)/live/Sheet'
import { tripQueryOptions } from '@/lib/trips/tripQuery'
import { crossRate, fetchFx, isStale, refreshFx } from '@/lib/catalogue/fx'
import { qk } from '@/lib/catalogue/keys'
import { COUNTRY_CURRENCIES, currencyCountries } from '@/lib/catalogue/countryCurrencies'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { useTripScope } from '@/lib/trips/TripScope'
import { useTripRole } from '@/lib/trips/useTripRole'
import { useMoney } from '@/lib/trips/Money'
import { useOnline } from '@/lib/useOnline'
import { rateText, refreshedText } from '@/lib/trips/fxText'
import { useToast } from '@/components/Toast'
import { SaveError } from '@/components/trips/SaveError'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'
import { Group, Row, rowCls } from '@/components/ui/SettingsList'
import type { TripState } from '@/lib/trips/types'

// Exchange rates on a page of their own (the phone's RatesScreen, round 5):
// the journey's currencies at the morning's rates, one unit each in the base,
// a ✕ to stop watching one, "+ Add a currency" with a searchable list of every
// currency the feed knows. Rates are READ-ONLY (owner decision 2026-07-25: one
// bad manual input would quietly distort every total; fx_rates has no write
// policy). The only controls are which currencies to watch and, on the web,
// when to re-fetch. A currency also appears here by itself when a stop needs
// it; the base one can't be removed, and one still used by a booking stays.

function ago(iso: string | null): string {
  if (!iso) return 'never'
  const mins = Math.max(0, Math.round((Date.now() - +new Date(iso)) / 60_000))
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const h = Math.round(mins / 60)
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`
  return `${Math.round(h / 24)} days ago`
}

/** Rows that would lose their converted total if this currency vanished. */
function countUses(s: TripState, code: string): number {
  let n = 0
  for (const x of s.stays ?? []) if (x.cur === code) n++
  for (const x of s.transport ?? []) if (x.cur === code) n++
  return n
}

/** "Thai Baht", where the browser knows the name. */
function currencyName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'currency' }).of(code) ?? ''
  } catch {
    return ''
  }
}

export default function RatesClient() {
  const sb = createClient()
  const qc = useQueryClient()
  const { tripId } = useTripScope()
  const trip = useQuery({ ...tripQueryOptions(sb, tripId), enabled: tripId !== null })
  const fx = useQuery({ queryKey: qk.fx, queryFn: () => fetchFx(sb), staleTime: 60 * 60_000 })
  const online = useOnline()
  const mut = useTripMutation()
  const { canEdit } = useTripRole()
  const { fmt } = useMoney()
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const state = trip.data?.state
  const base = state?.meta?.baseCurrency || 'HUF'
  const watched = useMemo(
    () => Object.keys(state?.rates ?? {}).filter((c) => c !== base).sort(),
    [state?.rates, base],
  )
  // Every currency the feed knows; the route's countries when the feed is out of reach.
  const addable = useMemo(() => {
    const all = new Set<string>(Object.keys(fx.data?.perUsd ?? {}))
    if (all.size === 0) for (const codes of Object.values(COUNTRY_CURRENCIES)) for (const c of codes) all.add(c)
    return [...all].filter((c) => c !== base && !watched.includes(c)).sort()
  }, [fx.data, base, watched])

  if (tripId === null) return <CreateTripEmptyState />
  if (trip.isPending) return <main className="mx-auto max-w-xl px-4 pt-[18px] text-base text-tx2">Loading…</main>
  if (!trip.data || !state) return <CreateTripEmptyState />

  const stale = isStale(fx.data?.lastSuccessAt ?? null)
  const failed = !!fx.data?.lastError

  async function doRefresh() {
    setBusy(true)
    setRefreshError(null)
    const r = await refreshFx(sb)
    if (!r.ok) setRefreshError(r.error ?? 'refresh failed')
    await qc.invalidateQueries({ queryKey: qk.fx })
    setBusy(false)
  }
  function add(code: string) {
    setAdding(false)
    if (!code || watched.includes(code) || code === base) return
    mut.mutate((s) => ({
      ...s,
      // Seeded with the live value so an offline launch has something real.
      rates: { ...s.rates, [code]: crossRate(fx.data?.perUsd ?? {}, code, base) ?? 0 },
      meta: { ...s.meta, fxDismissed: (s.meta.fxDismissed ?? []).filter((x) => x !== code) },
    }), { onSuccess: () => toast(`Added · ${code}`) })
  }
  function remove(code: string) {
    // Zeroing a rate that rows still reference would silently wipe their
    // totals, so refuse rather than "helpfully" removing it.
    const used = countUses(state!, code)
    if (used > 0) { toast(`${used} ${used === 1 ? 'booking still uses' : 'bookings still use'} ${code}. Change or delete them first.`); return }
    mut.mutate((s) => {
      const rates = { ...s.rates }
      delete rates[code]
      // Remembered, so auto-add never resurrects it while the country is on the route.
      return { ...s, rates, meta: { ...s.meta, fxDismissed: [...new Set([...(s.meta.fxDismissed ?? []), code])] } }
    }, { onSuccess: () => toast(`Removed · ${code}`) })
  }

  return (
    <main className="lv-enter mx-auto flex max-w-xl flex-col gap-4 px-4 pb-6 pt-[10px]">
      <div>
        <Link href="/settings" className="-ml-1.5 inline-flex min-h-11 items-center text-base font-semibold text-ac2-deep">
          <ChevronLeft aria-hidden className="size-5" />Trip settings
        </Link>
        <h1 className="font-serif text-[25px] font-semibold leading-[1.15] tracking-[-.01em]">Exchange rates</h1>
      </div>
      <SaveError show={mut.isError} error={mut.error} />

      {(!online || failed) && (
        <div className={'rounded-[var(--r)] border-[1.5px] px-4 py-3 text-[14px] leading-snug ' + (failed ? 'border-ac2-line bg-ac2-soft' : 'border-warn-line bg-warn-soft')}>
          {!online ? 'Offline, showing the rates saved on this device.' : <>Couldn’t reach the rate feed; showing values from <b>{ago(fx.data?.lastSuccessAt ?? null)}</b>.</>}
        </div>
      )}

      <Group footer={`${refreshedText(fx.data?.lastSuccessAt)}. Rates refresh every morning from the day’s market rates. All figures are ${base} per 1 unit.`}>
        {watched.length === 0 && <p className="py-3 text-base text-tx2">Only {base} so far. A currency appears here as soon as a stop needs it, or add one.</p>}
        {watched.map((code) => {
          const live = crossRate(fx.data?.perUsd ?? {}, code, base)
          const shown = live ?? state.rates[code]
          const where = currencyCountries(code)
          return (
            <Row key={code} label={<span>1 {code}{where.length > 0 && <span className="text-tx2"> · {where[0]}{where.length > 1 ? ` +${where.length - 1}` : ''}</span>}</span>}>
              <span className="tabular-nums text-tx">{rateText(shown, fmt)}</span>
              {canEdit && (
                <button type="button" onClick={() => remove(code)} aria-label={`Stop watching ${code}`} title={`Stop watching ${code}`} className="-mr-1 flex size-8 flex-none items-center justify-center rounded-full text-tx3">
                  <X aria-hidden className="size-[14px]" strokeWidth={2.6} />
                </button>
              )}
            </Row>
          )
        })}
        {canEdit && (
          <button type="button" onClick={() => setAdding(true)} className={rowCls + ' w-full text-left font-medium text-ac'}>
            <span className="flex items-center gap-2"><Plus aria-hidden className="size-4" strokeWidth={2.6} /> Add a currency</span>
          </button>
        )}
      </Group>

      <Group footer={refreshError ? <span className="text-warn">{refreshError}</span> : 'The feed moves once a day, so a refresh rarely changes anything.'}>
        <button type="button" onClick={doRefresh} disabled={busy || !online} className={rowCls + ' w-full text-left disabled:opacity-50'}>
          <span className={stale || failed ? 'font-medium text-ac' : ''}>{busy ? 'Checking…' : failed ? 'Try again' : 'Refresh now'}</span>
          <span className={'text-[14px] ' + (failed ? 'text-ac2' : stale ? 'text-warn' : 'text-tx3')}>updated {ago(fx.data?.lastSuccessAt ?? null)}</span>
        </button>
      </Group>

      {adding && <CurrencyPicker codes={addable} onPick={add} onClose={() => setAdding(false)} />}
    </main>
  )
}

/** Every currency the rates feed knows, searchable by code or name (the phone's CurrencyPicker). */
function CurrencyPicker({ codes, onPick, onClose }: { codes: string[]; onPick: (code: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const folded = q.trim().toLowerCase()
  const list = codes
    .map((code) => ({ code, name: currencyName(code) }))
    .filter((c) => !folded || c.code.toLowerCase().includes(folded) || c.name.toLowerCase().includes(folded))
  return (
    <Sheet label="Add a currency" onClose={onClose}>
      <h3 className="text-[20px] font-semibold">Add a currency</h3>
      <input
        type="search"
        enterKeyHint="search"
        aria-label="Search currencies"
        placeholder="Code or name"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 py-3 text-base text-tx outline-none focus:border-ac"
      />
      <div className="flex flex-col">
        {list.map((c) => (
          <button key={c.code} type="button" onClick={() => onPick(c.code)} className="flex min-h-11 items-center gap-3 border-t border-ln py-2 text-left">
            <span className="w-12 flex-none text-base font-semibold text-tx">{c.code}</span>
            <span className="min-w-0 flex-1 truncate text-base text-tx2">{c.name}</span>
          </button>
        ))}
        {list.length === 0 && <p className="py-4 text-base text-tx2">Nothing matches “{q}”.</p>}
      </div>
    </Sheet>
  )
}
