import type { City } from '@/lib/catalogue/types'
import { getAtJsonPath } from '@/lib/catalogue/getAtJsonPath'
import type { TripState, LedgerEntry, Segment } from './types'
import { toHUF, usdToHUF, segNights } from './format'

// A city's cost profile, built ONLY from the catalogue attributes (the full nested
// cost objects). If a city lacks them it is OMITTED from the index, so a lookup
// returns undefined and the math takes the "not catalogued" branch — exactly like
// the static app's kb() returning undefined. We never fabricate tiers from the
// *_mid scalar columns (that would silently wrong-number the budget/comfort tiers).
export interface CityCost {
  r: string | null
  accom: [number, number, number] // [budget, mid, nice] USD/night
  live: [number, number, number] // [low, mid, high] USD/day
  allIn?: [number, number] // [lo, hi] USD/day for 2
}

export function buildCityIndex(cities: City[]): Record<string, CityCost> {
  const idx: Record<string, CityCost> = {}
  for (const c of cities) {
    const a = getAtJsonPath(c.attributes, 'costs.accomPerNight') as
      | { budget?: number; mid?: number; nice?: number }
      | undefined
    const l = getAtJsonPath(c.attributes, 'costs.dailyLiving') as
      | { low?: number; mid?: number; high?: number }
      | undefined
    if (
      !a || !l ||
      a.budget == null || a.mid == null || a.nice == null ||
      l.low == null || l.mid == null || l.high == null
    ) {
      continue // treat as "not catalogued"
    }
    const allInRaw = getAtJsonPath(c.attributes, 'costs.allInDayMid') as number[] | undefined
    idx[c.city] = {
      r: c.region,
      accom: [a.budget, a.mid, a.nice],
      live: [l.low, l.mid, l.high],
      allIn:
        Array.isArray(allInRaw) && allInRaw.length >= 2 ? [allInRaw[0], allInRaw[1]] : undefined,
    }
  }
  return idx
}

// === computeBudget — faithful port of core.js ===
export interface PerSeg {
  seg: Segment
  nights: number
  tier: number
  accom: number
  accomSrc: 'included' | 'estimate' | 'none'
  live: number
  total: number
  kb: CityCost | undefined
}
export function computeBudget(state: TripState, cityIdx: Record<string, CityCost>) {
  const rates = state.rates
  let accom = 0, live = 0, transport = 0, extras = 0
  const perSeg: PerSeg[] = []
  state.segments
    .filter((s) => s.include !== false)
    .forEach((s) => {
      const k = cityIdx[s.city]
      const nn = segNights(s)
      const tier = Math.min(2, Math.max(0, Number(s.tier ?? 1) || 0)) // clamp DB-sourced tier (0..2)
      const inc = state.stays.filter((st) => st.segId === s.id && st.include)
      let aHUF: number
      let aSrc: PerSeg['accomSrc']
      if (inc.length) {
        aHUF = inc.reduce(
          (a, st) => a + toHUF(st.ppn, st.cur, rates) * (st.nights != null ? st.nights : nn),
          0,
        )
        aSrc = 'included'
      } else if (k) {
        aHUF = usdToHUF(k.accom[tier], rates) * nn
        aSrc = 'estimate'
      } else {
        aHUF = 0
        aSrc = 'none'
      }
      const lHUF = k ? usdToHUF(k.live[tier], rates) * nn : 0
      accom += aHUF
      live += lHUF
      perSeg.push({ seg: s, nights: nn, tier, accom: aHUF, accomSrc: aSrc, live: lHUF, total: aHUF + lHUF, kb: k })
    })
  state.transport.forEach((t) => { if (t.include) transport += toHUF(t.price, t.cur, rates) })
  state.extras.forEach((e) => { if (e.include) extras += toHUF(e.amount, e.cur, rates) })
  const grand = accom + live + transport + extras
  const totalNights = state.segments
    .filter((s) => s.include !== false)
    .reduce((a, s) => a + segNights(s), 0)
  return {
    accom, live, transport, extras, grand, perSeg, totalNights,
    perPerson: grand / (state.meta.travelers || 1),
    perDay: totalNights ? grand / totalNights : 0,
  }
}

// === ledgerByMonth — money.js (insertion order, not sorted) ===
export function ledgerByMonth(ledger: LedgerEntry[], rates: Record<string, number>) {
  const M: Record<string, { inc: number; exp: number }> = {}
  const order: string[] = []
  const bucket = (k: string) => {
    if (!M[k]) { M[k] = { inc: 0, exp: 0 }; order.push(k) }
    return M[k]
  }
  ledger.forEach((e) => {
    if (!e.date) return
    const huf = toHUF(e.amount, e.currency, rates)
    if (e.type === 'expense') bucket(e.date.slice(0, 7)).exp += huf
    else bucket(e.date.slice(0, 7)).inc += huf
  })
  return { M, order }
}

// === viewMonthly bucketing — views.js (order.sort() applied) ===
export interface MonthBucket { nights: number; accom: number; live: number; transport: number }
export function monthlyBuckets(state: TripState, cityIdx: Record<string, CityCost>) {
  const rates = state.rates
  const M: Record<string, MonthBucket> = {}
  const order: string[] = []
  const bucket = (k: string) => {
    if (!M[k]) { M[k] = { nights: 0, accom: 0, live: 0, transport: 0 }; order.push(k) }
    return M[k]
  }
  state.segments
    .filter((s) => s.include !== false)
    .forEach((s) => {
      const nn = segNights(s)
      if (nn <= 0) return
      const k = cityIdx[s.city]
      const tier = Math.min(2, Math.max(0, Number(s.tier ?? 1) || 0)) // clamp DB-sourced tier (0..2)
      const chosen = state.stays.filter((st) => st.segId === s.id && st.include)
      const accomTotal = chosen.length
        ? chosen.reduce(
            (a, st) => a + toHUF(st.ppn, st.cur, rates) * (st.nights != null ? st.nights : nn),
            0,
          )
        : k ? usdToHUF(k.accom[tier], rates) * nn : 0
      const accomPN = accomTotal / nn
      const livePN = k ? usdToHUF(k.live[tier], rates) : 0
      const d = new Date(s.arrive + 'T00:00:00') // LOCAL parse for month walk
      for (let i = 0; i < nn; i++) {
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
        const b = bucket(key)
        b.nights++
        b.accom += accomPN
        b.live += livePN
        d.setDate(d.getDate() + 1)
      }
    })
  state.transport
    .filter((t) => t.include && t.date)
    .forEach((t) => { bucket(t.date!.slice(0, 7)).transport += toHUF(t.price, t.cur, rates) })
  order.sort()
  return { M, order }
}

// === plannedByMonth — money.js: flat HUF/month = accom + live + transport ===
export function plannedByMonth(state: TripState, cityIdx: Record<string, CityCost>) {
  const { M } = monthlyBuckets(state, cityIdx)
  const out: Record<string, number> = {}
  for (const k of Object.keys(M)) out[k] = M[k].accom + M[k].live + M[k].transport
  return out
}
