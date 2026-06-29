'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Globe from 'globe.gl'
import type { City, Country } from '@/lib/catalogue/types'
import type { Segment, TransportLeg } from '@/lib/trips/types'
import type { CityCost } from '@/lib/trips/budget'
import { regColor, regName, fmtHUF, toHUF } from '@/lib/trips/format'
import { getAtJsonPath } from '@/lib/catalogue/getAtJsonPath'
import {
  type MapOpts, type GlobePoint, type Hazard,
  loadMapOpts, saveMapOpts, buildRoute, buildArcs, seasonalHazards, quakesFromFeed, qColor,
} from '@/lib/map/globeData'
import { CountryPanel } from './map/CountryPanel'
import { HazardPanel } from './map/HazardPanel'
import { Legend } from './map/Legend'

type Inst = InstanceType<typeof Globe>
interface GlobeProps {
  cities: City[]
  countries: Country[]
  cityIdx: Record<string, CityCost>
  segments: Segment[]
  transport: TransportLeg[]
  rates: Record<string, number>
}
const POV = { lat: 28, lng: 92, altitude: 2.4 }
let _featsCache: unknown[] | null = null // module cache for the borders geojson features

export default function GlobeView({ cities, countries, cityIdx, segments, transport, rates }: GlobeProps) {
  const router = useRouter()
  const boxRef = useRef<HTMLDivElement>(null)
  const instRef = useRef<Inst | null>(null)
  const basePtsRef = useRef<Array<GlobePoint | Hazard>>([])
  const hazAbortRef = useRef<AbortController | null>(null)

  const [opts, setOpts] = useState<MapOpts>(() => loadMapOpts())
  const optsRef = useRef(opts)
  const [menuOpen, setMenuOpen] = useState(false)
  const [countryFeat, setCountryFeat] = useState<{ properties?: { name?: string; iso?: string } } | null>(null)
  const [hazard, setHazard] = useState<Hazard | null>(null)
  const [hazInfo, setHazInfo] = useState<{ total: number; quakes: number | null } | null>(null)

  useEffect(() => { optsRef.current = opts; saveMapOpts(opts) }, [opts])

  // ---- tooltip closures (return HTML strings; globe.gl renders them) ----
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]!))
  const box = (inner: string, mw = '') =>
    `<div style="${mw}background:#171e26;border:1px solid #2a3642;border-radius:10px;padding:8px 10px;color:#e8edf2;font:12.5px -apple-system,sans-serif;line-height:1.5">${inner}</div>`
  function hazLabel(d: Hazard) {
    if (d.kind === 'quake') return box(`<b style="color:${qColor(d.mag ?? 0)}">M${d.mag?.toFixed(1) ?? '?'} earthquake</b><br><span style="color:#8fa0b0">${esc(d.place)}</span><br><span style="color:#37b3a4">click for details</span>`)
    return box(`<b style="color:#f0a83c">Heavy rain / monsoon</b><br><span style="color:#8fa0b0">${esc(d.city)} · ~${d.rain}mm this month</span><br><span style="color:#37b3a4">click for details</span>`)
  }
  function pointLabel(d: GlobePoint | Hazard) {
    if ('haz' in d && d.haz) return hazLabel(d as Hazard)
    const p = d as GlobePoint
    const k = cityIdx[p.city]
    const c = p.city_
    let rows = ''
    if (k?.live) rows += `<div>Daily living: ~$${k.live[0]}–$${k.live[2]} /day (2 ppl)</div>`
    if (k?.accom) rows += `<div>Stay (mid): ~$${k.accom[1]} /night</div>`
    if (c?.rent_monthly) rows += `<div>Rent: ~$${c.rent_monthly} /mo</div>`
    const net = c && getAtJsonPath(c.attributes, 'internet')
    if (net) rows += `<div style="color:#8fa0b0">Wi-Fi: ${esc(net)}</div>`
    const land = c && (getAtJsonPath(c.attributes, 'landmarks') as unknown[] | undefined)
    if (Array.isArray(land) && land.length) rows += `<div style="color:#8fa0b0">${land.length} landmark${land.length > 1 ? 's' : ''} in KB</div>`
    const wx = c && getAtJsonPath(c.attributes, 'weather.hazard')
    const wxRow = wx ? `<div style="color:#8fa0b0;margin-top:3px">${esc(wx)}</div>` : ''
    return box(`<div style="font-weight:700;font-size:13.5px">${esc(p.city)}</div><div style="color:#8fa0b0;margin-bottom:4px">${esc(p.country)} · ${esc(regName(p.r ?? ''))}</div>${rows}${wxRow}<div style="color:#37b3a4;margin-top:5px">Click → Knowledge Base</div>`, 'max-width:250px;')
  }
  function arcLabel(d: { from: string; to: string; flight: TransportLeg | null; booked: boolean }) {
    const head = `<b>${esc(d.from)} → ${esc(d.to)}</b>`
    let body: string
    if (d.flight) {
      const f = d.flight
      body = `<div>${esc(f.type || 'Flight')} · ${esc(String(f.price))} ${esc(f.cur)} <span style="color:#8fa0b0">(~${fmtHUF(toHUF(f.price, f.cur, rates))})</span></div>`
        + `<div style="margin-top:2px">${d.booked ? '<span style="color:#f0a83c">✅ booked</span>' : '<span style="color:#8fa0b0">~ estimate</span>'}${f.provider ? ` · ${esc(f.provider)}` : ''}</div>`
    } else body = '<div style="color:#8fa0b0">no flight logged for this hop</div>'
    return box(head + body)
  }

  // ---- hazards: abortable, re-checks live state in the .then ----
  function applyHazards() {
    const g = instRef.current
    if (!g) return
    hazAbortRef.current?.abort()
    hazAbortRef.current = null
    if (!optsRef.current.hazards) {
      g.ringsData([]); g.pointsData(basePtsRef.current as object[]); setHazInfo({ total: 0, quakes: null }); return
    }
    const seasonal = seasonalHazards(segments, cities)
    g.ringsData(seasonal.slice()); g.pointsData(basePtsRef.current.concat(seasonal) as object[]); setHazInfo({ total: seasonal.length, quakes: null })
    const ac = new AbortController(); hazAbortRef.current = ac
    fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson', { signal: ac.signal })
      .then((r) => r.json())
      .then((j) => {
        if (ac.signal.aborted || !optsRef.current.hazards || instRef.current !== g) return
        const q = quakesFromFeed(j)
        const all = seasonal.concat(q)
        g.ringsData(all.slice()); g.pointsData(basePtsRef.current.concat(all) as object[]); setHazInfo({ total: all.length, quakes: q.length })
      })
      .catch(() => { /* offline / CORS / aborted: keep seasonal only */ })
  }

  // ===== BUILD effect — DATA deps only (opts read via optsRef) =====
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const { route } = buildRoute(segments, cities, cityIdx, transport)
    const routeSet = new Set(route.filter((n) => !n.home).map((n) => n.city))
    const points: GlobePoint[] = cities
      .filter((c) => c.lat != null && c.lng != null)
      .map((c) => {
        const on = routeSet.has(c.city)
        const k = cityIdx[c.city]
        return {
          lat: c.lat!, lng: c.lng!, city: c.city, country: c.country, r: k?.r ?? c.region ?? null, city_: c,
          color: on ? regColor(k?.r ?? c.region) : 'rgba(178,196,212,0.9)', radius: on ? 0.6 : 0.36, alt: on ? 0.02 : 0.01,
        }
      })
    const origin = route.find((n) => n.home)
    if (origin) {
      points.push({ lat: origin.lat, lng: origin.lng, city: origin.city, country: origin.country, r: null, home: true, color: '#ffffff', radius: 0.72, alt: 0.025 })
    }
    basePtsRef.current = points
    const arcs = buildArcs(route, transport)

    const g = new Globe(el)
      .globeImageUrl(optsRef.current.day ? '/vendor/earth-day.jpg' : '/vendor/earth-night.jpg')
      .backgroundColor('rgba(0,0,0,0)')
      .showAtmosphere(true).atmosphereColor('#37b3a4').atmosphereAltitude(0.16)
      .pointsData(points as object[]).pointLat('lat').pointLng('lng').pointColor('color').pointAltitude('alt').pointRadius('radius')
      .pointLabel(((d: object) => pointLabel(d as GlobePoint | Hazard)) as never)
      .onPointClick(((d: object) => {
        const p = d as GlobePoint & Partial<Hazard>
        if (p.haz) { setHazard(p as unknown as Hazard); return }
        if (p.home) return
        router.push('/knowledge')
      }) as never)
      .arcsData(arcs as object[]).arcStartLat('startLat').arcStartLng('startLng').arcEndLat('endLat').arcEndLng('endLng')
      .arcColor('color').arcStroke('stroke').arcDashLength('dashLen').arcDashGap('dashGap')
      .arcDashAnimateTime(((d: { anim: number }) => d.anim) as never).arcLabel(((d: object) => arcLabel(d as Parameters<typeof arcLabel>[0])) as never)
      .polygonsData([]).polygonCapColor(() => 'rgba(0,0,0,0)').polygonSideColor(() => 'rgba(0,0,0,0)')
      .polygonStrokeColor((() => (optsRef.current.borders ? 'rgba(170,190,210,0.6)' : 'rgba(0,0,0,0)')) as never).polygonAltitude(0.004)
      .onPolygonClick(((p: object) => setCountryFeat(p as { properties?: { name?: string; iso?: string } })) as never)
      .ringsData([]).ringLat('lat').ringLng('lng').ringMaxRadius('maxR').ringPropagationSpeed('speed').ringRepeatPeriod('period')
      .ringColor((((d: Hazard) => (d.kind === 'quake' ? (t: number) => `rgba(224,101,92,${1 - t})` : (t: number) => `rgba(240,168,60,${1 - t})`))) as never)
      .labelsData(route as object[]).labelLat('lat').labelLng('lng').labelText('label').labelSize(0.9).labelDotRadius(0.34)
      .labelColor(((d: { home?: boolean }) => (d.home ? '#ffffff' : '#e8edf2')) as never).labelResolution(2)

    instRef.current = g
    g.pointOfView(POV, 0)
    const ctl = g.controls() as { autoRotate: boolean; autoRotateSpeed: number; enableDamping: boolean }
    try { ctl.autoRotate = optsRef.current.rotate; ctl.autoRotateSpeed = 0.55; ctl.enableDamping = true } catch {}

    const setFeats = (feats: unknown[]) => { _featsCache = feats; instRef.current?.polygonsData(feats.slice() as object[]) }
    if (_featsCache) setFeats(_featsCache)
    else fetch('/vendor/countries.geojson').then((r) => r.json()).then((j) => setFeats(j?.features ?? [])).catch(() => setFeats([]))

    applyHazards()

    const onResize = () => { g.width(el.clientWidth); g.height(el.clientHeight) }
    onResize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      hazAbortRef.current?.abort()
      ;(g as unknown as { _destructor?: () => void })._destructor?.()
      instRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cities, cityIdx, segments, transport, rates])

  // ===== PATCH effects — mutate the live instance, no rebuild =====
  useEffect(() => { instRef.current?.globeImageUrl(opts.day ? '/vendor/earth-day.jpg' : '/vendor/earth-night.jpg') }, [opts.day])
  useEffect(() => { const c = instRef.current?.controls() as { autoRotate: boolean } | undefined; if (c) c.autoRotate = opts.rotate }, [opts.rotate])
  useEffect(() => { instRef.current?.polygonStrokeColor((() => (opts.borders ? 'rgba(170,190,210,0.6)' : 'rgba(0,0,0,0)')) as never) }, [opts.borders])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { applyHazards() }, [opts.hazards])

  return (
    <>
      <div ref={boxRef} className="absolute inset-0" />
      <div className="absolute right-3 top-3 z-10">
        <button className="rounded-lg border border-[#2a3642] bg-[#0f1419]/80 px-2 py-1 text-xs text-[#e8edf2] backdrop-blur md:hidden" onClick={() => setMenuOpen((o) => !o)}>⚙ Map</button>
        <div className={`${menuOpen ? 'flex' : 'hidden'} mt-1 flex-col gap-1 md:flex`}>
          {([
            ['rotate', `↻ Spin: ${opts.rotate ? 'on' : 'off'}`],
            ['day', `${opts.day ? '☀' : '🌙'} View: ${opts.day ? 'day' : 'night'}`],
            ['borders', `🗺 Borders: ${opts.borders ? 'on' : 'off'}`],
            ['hazards', `⚡ Hazards: ${opts.hazards ? 'on' : 'off'}`],
          ] as const).map(([k, label]) => (
            <button key={k} className="rounded-lg border border-[#2a3642] bg-[#0f1419]/80 px-2 py-1 text-left text-xs text-[#e8edf2] backdrop-blur" onClick={() => setOpts((o) => ({ ...o, [k]: !o[k] }))}>{label}</button>
          ))}
          <button className="rounded-lg border border-[#2a3642] bg-[#0f1419]/80 px-2 py-1 text-xs text-[#e8edf2] backdrop-blur" onClick={() => instRef.current?.pointOfView(POV, 600)}>⟲ Reset</button>
        </div>
      </div>
      {opts.hazards && hazInfo && (
        <div className="absolute left-3 top-3 z-10 rounded-lg border border-[#2a3642] bg-[#0f1419]/80 px-3 py-1 text-xs text-[#e8edf2] backdrop-blur">
          ⚡ {hazInfo.total} hazard{hazInfo.total === 1 ? '' : 's'}
          {hazInfo.quakes != null && <span className="text-[#ff7a45]"> · {hazInfo.quakes} live quake{hazInfo.quakes === 1 ? '' : 's'}</span>}
        </div>
      )}
      <Legend />
      {countryFeat && <CountryPanel feat={countryFeat} countries={countries} cities={cities} segments={segments} rates={rates} onClose={() => setCountryFeat(null)} />}
      {hazard && <HazardPanel d={hazard} onClose={() => setHazard(null)} />}
    </>
  )
}
