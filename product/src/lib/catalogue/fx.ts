import type { SupabaseClient } from '@supabase/supabase-js'

// FX snapshot (migration 19). Rates are stored against a CANONICAL USD base —
// per_usd is "units of this currency per 1 USD" — so every pair is arithmetic
// and changing the trip's base currency never needs a re-fetch.
//
// Nobody types these. The table has no write policy at all, so "not editable"
// is enforced by the database rather than by hiding an input.

export interface FxSnapshot {
  /** code -> units per 1 USD */
  perUsd: Record<string, number>
  lastSuccessAt: string | null
  lastError: string | null
  currencies: number | null
}

/** Rates go amber past this: the cron runs daily, so 48h means two misses. */
export const FX_STALE_MS = 48 * 3_600_000

export async function fetchFx(sb: SupabaseClient): Promise<FxSnapshot> {
  const [rates, status] = await Promise.all([
    sb.from('fx_rates').select('code, per_usd'),
    sb.from('fx_status').select('last_success_at, last_error, currencies').eq('id', true).maybeSingle(),
  ])
  if (rates.error) throw rates.error

  const perUsd: Record<string, number> = {}
  for (const r of rates.data ?? []) perUsd[r.code as string] = Number(r.per_usd)

  return {
    perUsd,
    lastSuccessAt: (status.data?.last_success_at as string | null) ?? null,
    lastError: (status.data?.last_error as string | null) ?? null,
    currencies: (status.data?.currencies as number | null) ?? null,
  }
}

/**
 * How many units of `base` one unit of `code` is worth.
 * Returns null when either side is missing, so callers can fall back to the
 * last-known value cached in the trip document rather than silently using 0 —
 * a zero rate would quietly wipe totals.
 */
export function crossRate(
  perUsd: Record<string, number>,
  code: string,
  base: string,
): number | null {
  if (code === base) return 1
  const a = perUsd[base]
  const b = perUsd[code]
  if (!a || !b) return null
  return a / b
}

export function isStale(lastSuccessAt: string | null, now = Date.now()): boolean {
  if (!lastSuccessAt) return true
  return now - +new Date(lastSuccessAt) > FX_STALE_MS
}

/**
 * Manual "Refresh now". Rate-limited server-side to once a minute; the feed
 * only moves once a day, so hammering it buys nothing.
 */
export async function refreshFx(sb: SupabaseClient): Promise<{ ok: boolean; error?: string }> {
  const { data: session } = await sb.auth.getSession()
  const token = session.session?.access_token
  if (!token) return { ok: false, error: 'not signed in' }

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/fx-refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}',
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: body.error ?? `refresh failed (${res.status})` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' }
  }
}
