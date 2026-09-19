'use client'
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useMoney } from '@/lib/trips/Money'
import Globe from 'globe.gl'
import { Info, LocateFixed, Map as MapIcon, Moon, RotateCw, SlidersHorizontal, Sun, Zap } from 'lucide-react'
import type { City, Country } from '@/lib/catalogue/types'
import type { Segment, TransportLeg } from '@/lib/trips/types'
import type { CityCost } from '@/lib/trips/budget'
import type { SharedRouteStop } from '@/lib/follow/api'
import type { PeopleAtCity } from '@/lib/map/people'
import { regName, toBase } from '@/lib/trips/format'
import {
  type MapOpts, type GlobePoint, type GlobeArc, type Hazard,
  loadMapOpts, saveMapOpts, buildRoute, buildArcs, seasonalHazards, cityInfoRows, theirRouteLayers, SKY,
} from '@/lib/map/globeData'
import { fetchQuakes, QUAKES_KEY, QUAKES_STALE_MS } from '@/lib/map/hazards'
import { CountryPanel } from './map/CountryPanel'
import { HazardPanel, HazardSourcesPanel } from './map/HazardPanel'
import { Legend } from './map/Legend'

// The planner globe. ONE globe.gl instance for the life of the page (issue #32
// fix 3): the build effect runs once, and every later change — trip edits,
// catalogue loads, option flips, the hazard feed — patches the live instance.
// Accessor callbacks are registered at build time, so anything they read
// (costs, rates, options) goes through a ref rather than a closure.

type Inst = InstanceType<typeof Globe>
type CountryFeat = { properties?: { name?: string; iso?: string } }
interface GlobeProps {
  cities: City[]
  countries: Country[]
  cityIdx: Record<string, CityCost>
  segments: Segment[]
  transport: TransportLeg[]
  rates: Record<string, number>
  /** a catalogue pin was tapped (fix 2): the parent shows the card, no navigation here */
  onPickCity?: (c: City) => void
  /** issue #9: the people you follow, by city; a mark per city, thicker as more arrive */
  people?: PeopleAtCity[]
  /** issue #9: one followed traveller's itinerary drawn beside yours */
  theirRoute?: { name: string; route: SharedRouteStop[] } | null
  /** local ISO date — splits a followed route into visited / now / upcoming */
  today?: string
  onPickPeople?: (g: PeopleAtCity) => void
}
// globe.gl's HTML layer is untyped in its .d.ts; this is the slice we use.
interface HtmlLayer {
  htmlElementsData(d: object[]): HtmlLayer
  htmlLat(a: string): HtmlLayer
  htmlLng(a: string): HtmlLayer
  htmlAltitude(a: number): HtmlLayer
  htmlElement(f: (d: object) => HTMLElement): HtmlLayer
  htmlElementVisibilityModifier(f: (el: HTMLElement, visible: boolean) => void): HtmlLayer
  htmlTransitionDuration(ms: number): HtmlLayer
}
const NO_PEOPLE: PeopleAtCity[] = []

// The people mark (Patrik's spec, 2026-09-18): a solid sky dot with person
// glyphs inside. One head is one glyph; two sit side by side; three make a
// pyramid (two below, one on top); from four on it is the pyramid and a plus.
// The dot grows a step per head up to five. Every offset is a fraction of the
// diameter, so the glyphs always sit inside the circle.
const PERSON_PATH = '<circle cx="12" cy="7" r="4"/><path d="M4 21a8 8 0 0 1 16 0z"/>'
export const MARK_CAP = 5
export function markDiameter(n: number) { return 20 + 3 * (Math.min(n, MARK_CAP) - 1) }
/** glyph centres (x, y as fractions of the diameter, from the centre) and sizes */
export function markLayout(n: number): { d: number; glyphs: Array<{ x: number; y: number; s: number }>; plus: { x: number; y: number; s: number } | null } {
  const d = markDiameter(n)
  if (n <= 1) return { d, glyphs: [{ x: 0, y: 0, s: 0.58 }], plus: null }
  if (n === 2) return { d, glyphs: [{ x: -0.16, y: 0, s: 0.46 }, { x: 0.16, y: 0, s: 0.46 }], plus: null }
  const pyramid = (cx: number, g: number) => [
    { x: cx, y: -0.15, s: g },
    { x: cx - 0.17, y: 0.13, s: g },
    { x: cx + 0.17, y: 0.13, s: g },
  ]
  if (n === 3) return { d, glyphs: pyramid(0, 0.4), plus: null }
  return { d, glyphs: pyramid(-0.11, 0.34), plus: { x: 0.3, y: 0, s: 0.26 } }
}
function place(x: number, y: number, s: number, d: number) {
  const px = s * d
  return `position:absolute;left:${(0.5 + x) * d - px / 2}px;top:${(0.5 + y) * d - px / 2}px;width:${px}px;height:${px}px`
}
function peopleMark(g: PeopleAtCity, onTap: (g: PeopleAtCity) => void, onDown: () => void): HTMLElement {
  const n = g.people.length
  const { d, glyphs, plus } = markLayout(n)
  const el = document.createElement('button')
  el.type = 'button'
  el.setAttribute('aria-label', `${n} traveller${n === 1 ? '' : 's'} you follow in ${g.city}`)
  el.style.cssText = `pointer-events:auto;cursor:pointer;position:relative;width:${d}px;height:${d}px;padding:0;border:0;border-radius:50%;background:${SKY};color:#0b0f14;box-shadow:0 0 0 2px rgba(11,15,20,.55);overflow:hidden;transition:opacity .2s`
  el.innerHTML = glyphs.map((q) =>
    `<svg viewBox="0 0 24 24" fill="currentColor" style="${place(q.x, q.y, q.s, d)}" aria-hidden="true">${PERSON_PATH}</svg>`).join('')
    + (plus ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" style="${place(plus.x, plus.y, plus.s, d)}" aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg>` : '')
  // A mark usually sits right over a route pin: tell the globe this tap is
  // taken before its own click resolution and the fallback hit-test run.
  el.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); onDown() })
  el.addEventListener('pointerup', (ev) => ev.stopPropagation())
  el.addEventListener('click', (ev) => { ev.stopPropagation(); onTap(g) })
  return el
}

const POV = { lat: 28, lng: 92, altitude: 2.4 }
// Globe radius is 100 world units: same clamps as FollowGlobe (fix 6) — "city
// level" to "whole hemisphere", never inside the planet, never a dot in space.
const MIN_DISTANCE = 130
const MAX_DISTANCE = 480
const IDLE_RESUME_MS = 10_000
// A tap's pixel tolerance for the fallback hit-test (fix 2), and how long a
// pointerup waits for globe.gl's own click before the fallback resolves it.
const TAP_TOLERANCE_PX = 18
const TAP_FALLBACK_MS = 90
let _featsCache: unknown[] | null = null // module cache for the borders geojson features

// Great-circle distance in degrees — the tap fallback's ruler.
function angDeg(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180
  const s = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2
  return 2 * Math.asin(Math.min(1, Math.sqrt(s))) / r
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]!))
// Tooltip chrome per frame 19's dark map UI: Work Sans at the 16px floor,
// dark surface, amber hazards (no red), mauve wayfinding hints.
const box = (inner: string, mw = '') =>
  `<div style="${mw}background:rgba(11,15,20,.92);border:1px solid rgba(216,224,229,.16);border-radius:14px;padding:10px 12px;color:#d8e0e5;font-family:var(--font-work-sans),'Work Sans',sans-serif;font-size:16px;line-height:1.5">${inner}</div>`
const MUTED = 'color:rgba(216,224,229,.6)'

function hazLabel(d: Hazard) {
  if (d.kind === 'quake') return box(`<b style="color:#D9A85C">M${d.mag?.toFixed(1) ?? '?'} earthquake</b><br><span style="${MUTED}">${esc(d.place)}</span><br><span style="color:#D08795">tap for details</span>`)
  return box(`<b style="color:#D9A85C">Heavy rain / monsoon</b><br><span style="${MUTED}">${esc(d.city)} · ~${d.rain}mm this month</span><br><span style="color:#D08795">tap for details</span>`)
}

export default function GlobeView({ cities, countries, cityIdx, segments, transport, rates, onPickCity, people = NO_PEOPLE, theirRoute = null, today = '', onPickPeople }: GlobeProps) {
  const { fmt } = useMoney()
  const boxRef = useRef<HTMLDivElement>(null)
  const instRef = useRef<Inst | null>(null)
  const readyRef = useRef(false)
  const basePtsRef = useRef<GlobePoint[]>([])
  const myArcsRef = useRef<GlobeArc[]>([])
  const theirPtsRef = useRef<GlobePoint[]>([])
  const theirArcsRef = useRef<GlobeArc[]>([])
  const seasonalRef = useRef<Hazard[]>([])
  const quakesRef = useRef<Hazard[]>([])
  const featsRef = useRef<unknown[]>([])
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const markTapAt = useRef(0) // last pointerdown on a people mark; pin clicks yield to it

  const [opts, setOpts] = useState<MapOpts>(() => loadMapOpts())
  const optsRef = useRef(opts)
  // Read by accessors registered once at build time (see the header note).
  const cityIdxRef = useRef(cityIdx)
  const ratesRef = useRef(rates)
  const fmtRef = useRef(fmt)
  const pickRef = useRef(onPickCity)
  const pickPeopleRef = useRef(onPickPeople)
  useEffect(() => { pickPeopleRef.current = onPickPeople }, [onPickPeople])
  useEffect(() => { cityIdxRef.current = cityIdx }, [cityIdx])
  useEffect(() => { ratesRef.current = rates }, [rates])
  useEffect(() => { fmtRef.current = fmt }, [fmt])
  useEffect(() => { pickRef.current = onPickCity }, [onPickCity])
  const [menuOpen, setMenuOpen] = useState(false)
  const [countryFeat, setCountryFeat] = useState<CountryFeat | null>(null)
  const [hazard, setHazard] = useState<Hazard | null>(null)
  // The count chip answers "how many"; this answers "of what, and how old".
  const [hazHelp, setHazHelp] = useState(false)
  const [hazInfo, setHazInfo] = useState<{ total: number; quakes: number | null } | null>(null)

  useEffect(() => { optsRef.current = opts; saveMapOpts(opts) }, [opts])

  // Live quakes through React Query (fix 8): cached across toggles and
  // screens, timed out by fetchQuakes, only fetched while the switch is on.
  const quakes = useQuery({
    queryKey: QUAKES_KEY,
    queryFn: ({ signal }) => fetchQuakes(signal),
    enabled: opts.hazards,
    staleTime: QUAKES_STALE_MS,
    gcTime: 60 * 60_000,
    retry: 1,
  })

  // ---- tooltip closures (return HTML strings; globe.gl renders them) ----
  function pointLabel(d: GlobePoint | Hazard) {
    if ('haz' in d && d.haz) return hazLabel(d as Hazard)
    const p = d as GlobePoint
    if (p.home) return box(`<div style="font-weight:600">${esc(p.city)}</div><div style="${MUTED}">home</div>`)
    if (p.who) return box(`<div style="font-weight:600;color:${SKY}">${esc(p.who)}</div><div>${esc(p.city)}, ${esc(p.country)}</div><div style="${MUTED}">${p.when === 'now' ? 'there now' : p.when === 'visited' ? 'visited' : 'upcoming'}</div>`)
    const rows = cityInfoRows(p.city_, cityIdxRef.current[p.city])
      .map((r) => `<div style="${r.muted ? MUTED : ''}">${esc(r.text)}</div>`).join('')
    return box(`<div style="font-weight:600;font-size:17px;font-family:var(--font-lora),Georgia,serif">${esc(p.city)}</div><div style="${MUTED};margin-bottom:4px">${esc(p.country)} · ${esc(regName(p.r ?? ''))}</div>${rows}<div style="color:#D08795;margin-top:5px">Tap for details</div>`, 'max-width:270px;')
  }
  function arcLabel(d: { from: string; to: string; flight: TransportLeg | null; booked: boolean; who?: string }) {
    if (d.who) return box(`<b style="color:${SKY}">${esc(d.who)}</b> · ${esc(d.from)} → ${esc(d.to)}`)
    const head = `<b>${esc(d.from)} → ${esc(d.to)}</b>`
    let body: string
    if (d.flight) {
      const f = d.flight
      body = `<div>${esc(f.type || 'Flight')} · ${esc(String(f.price))} ${esc(f.cur)} <span style="${MUTED}">(~${fmtRef.current(toBase(f.price, f.cur, ratesRef.current))})</span></div>`
        + `<div style="margin-top:2px">${d.booked ? '<span style="color:#D9A85C">✓ booked</span>' : `<span style="${MUTED}">~ estimate</span>`}${f.provider ? ` · ${esc(f.provider)}` : ''}</div>`
    } else body = `<div style="${MUTED}">no flight logged for this hop</div>`
    return box(head + body)
  }

  // ---- paint: points + rings from the refs. Called by every patch effect. ----
  // Hazards go UNDER the route (fix 4): only the strong ones ring, all of them
  // sit lower and smaller than a stop, and the count chip carries the detail.
  function paint() {
    const g = instRef.current
    if (!g) return
    const haz = optsRef.current.hazards ? seasonalRef.current.concat(quakesRef.current) : []
    g.pointsData((haz as Array<GlobePoint | Hazard>).concat(theirPtsRef.current, basePtsRef.current) as object[])
    g.arcsData((myArcsRef.current as GlobeArc[]).concat(theirArcsRef.current) as object[])
    g.ringsData(haz.filter((h) => h.ring).slice() as object[])
    setHazInfo(optsRef.current.hazards
      ? { total: haz.length, quakes: quakesRef.current.length ? quakesRef.current.length : null }
      : null)
  }
  function applyBorders() {
    // The toggle controls whether the polygons are in the scene at all (fix 5):
    // invisible caps were still catching taps meant for the ocean beside them.
    instRef.current?.polygonsData(optsRef.current.borders ? featsRef.current.slice() as object[] : [])
  }

  // ===== BUILD effect — once. Data, options and the feed patch it below. =====
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const g = new Globe(el)
      .globeImageUrl(optsRef.current.day ? '/vendor/earth-day.jpg' : '/vendor/earth-night.jpg')
      .backgroundColor('rgba(0,0,0,0)')
      .showAtmosphere(true).atmosphereColor('#7FA37D').atmosphereAltitude(0.16)
      .pointsData([]).pointLat('lat').pointLng('lng').pointColor('color').pointAltitude('alt').pointRadius('radius')
      .pointLabel(((d: object) => pointLabel(d as GlobePoint | Hazard)) as never)
      .onPointClick(((d: object) => {
        lastPointClick = performance.now()
        if (lastPointClick - markTapAt.current < 500) return
        const p = d as GlobePoint & Partial<Hazard>
        if (p.haz) { setHazard(p as unknown as Hazard); return }
        if (p.home || !p.city_) return
        pickRef.current?.(p.city_)
      }) as never)
      .pointsTransitionDuration(0)
      .arcsData([]).arcStartLat('startLat').arcStartLng('startLng').arcEndLat('endLat').arcEndLng('endLng')
      .arcColor('color').arcStroke('stroke').arcDashLength('dashLen').arcDashGap('dashGap')
      .arcDashAnimateTime(((d: { anim: number }) => d.anim) as never).arcLabel(((d: object) => arcLabel(d as Parameters<typeof arcLabel>[0])) as never)
      .polygonsData([]).polygonCapColor(() => 'rgba(0,0,0,0)').polygonSideColor(() => 'rgba(0,0,0,0)')
      .polygonStrokeColor(() => 'rgba(170,190,210,0.6)').polygonAltitude(0.004)
      .onPolygonClick(((p: object) => setCountryFeat(p as CountryFeat)) as never)
      .ringsData([]).ringLat('lat').ringLng('lng').ringMaxRadius('maxR').ringPropagationSpeed('speed').ringRepeatPeriod('period')
      // One amber hazard color per frame 19's legend (no red in the palette);
      // softer than the pins so a ring never outshouts a stop.
      .ringColor(((() => (t: number) => `rgba(217,168,92,${0.55 * (1 - t)})`)) as never)
      .labelsData([]).labelLat('lat').labelLng('lng').labelText('label').labelSize(0.9).labelDotRadius(0.34)
      .labelColor(((d: { home?: boolean }) => (d.home ? '#ffffff' : '#e8edf2')) as never).labelResolution(2)
      .onGlobeReady(() => {
        // pointOfView before init is stomped by the camera setup (see
        // FollowGlobe) — and it is set ONCE: a trip edit no longer snaps the
        // view back over Asia.
        readyRef.current = true
        g.pointOfView(POV, 0)
      })

    instRef.current = g
    ;(g as unknown as HtmlLayer)
      .htmlElementsData([]).htmlLat('lat').htmlLng('lng').htmlAltitude(0.012).htmlTransitionDuration(0)
      .htmlElement((d) => peopleMark(d as PeopleAtCity, (grp) => pickPeopleRef.current?.(grp), () => { markTapAt.current = performance.now() }))
      .htmlElementVisibilityModifier((el, visible) => { el.style.opacity = visible ? '1' : '0'; el.style.pointerEvents = visible ? 'auto' : 'none' })

    // globe.gl resolves a click through the object hovered on the last frame,
    // and it re-raycasts at most every 50 ms — so a quick tap (touch has no
    // hover to warm it up) can land on "nothing". Fallback: after a tap that
    // globe.gl did not answer, find the nearest catalogue pin under the finger.
    let lastPointClick = 0
    let down: { x: number; y: number } | null = null
    const onDown = (ev: PointerEvent) => { if (ev.button === 0) down = { x: ev.clientX, y: ev.clientY } }
    const onUp = (ev: PointerEvent) => {
      const d = down
      down = null
      if (!d || ev.button !== 0 || Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 6) return
      const upAt = performance.now()
      const rect = el.getBoundingClientRect()
      const x = ev.clientX - rect.left, y = ev.clientY - rect.top
      setTimeout(() => {
        if (lastPointClick >= upAt - 50) return // globe.gl answered this tap
        const hit = g.toGlobeCoords(x, y)
        if (!hit) return
        const probe = g.toGlobeCoords(x + TAP_TOLERANCE_PX, y) ?? g.toGlobeCoords(x - TAP_TOLERANCE_PX, y)
        const tol = Math.max(0.4, probe ? angDeg(hit, probe) : 1.5)
        let best: GlobePoint | null = null, bestD = tol
        for (const pt of basePtsRef.current) {
          if (pt.home || !pt.city_) continue
          const dd = angDeg(hit, pt)
          if (dd < bestD) { bestD = dd; best = pt }
        }
        if (best?.city_) pickRef.current?.(best.city_)
      }, TAP_FALLBACK_MS)
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)

    const ctl = g.controls()
    ctl.autoRotate = optsRef.current.rotate
    ctl.autoRotateSpeed = 0.55
    ctl.enableDamping = true
    ctl.enableZoom = true
    ctl.minDistance = MIN_DISTANCE
    ctl.maxDistance = MAX_DISTANCE
    // The spin yields to your drag (fix 7): pause on interaction, resume after
    // ten idle seconds — but only if Spin is still on.
    const onInteractStart = () => {
      ctl.autoRotate = false
      if (idleTimer.current) clearTimeout(idleTimer.current)
    }
    const onInteractEnd = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(() => { ctl.autoRotate = optsRef.current.rotate }, IDLE_RESUME_MS)
    }
    ctl.addEventListener('start', onInteractStart)
    ctl.addEventListener('end', onInteractEnd)

    const setFeats = (feats: unknown[]) => { _featsCache = feats; featsRef.current = feats; applyBorders() }
    if (_featsCache) setFeats(_featsCache)
    else fetch('/vendor/countries.geojson').then((r) => r.json()).then((j) => setFeats(j?.features ?? [])).catch(() => setFeats([]))

    const onResize = () => { g.width(el.clientWidth); g.height(el.clientHeight) }
    onResize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      ctl.removeEventListener('start', onInteractStart)
      ctl.removeEventListener('end', onInteractEnd)
      if (idleTimer.current) clearTimeout(idleTimer.current)
      readyRef.current = false
      ;(g as unknown as { _destructor?: () => void })._destructor?.()
      instRef.current = null
    }
  }, [])

  // ===== DATA effect — the trip and the catalogue, patched in place =====
  useEffect(() => {
    const g = instRef.current
    if (!g) return
    const { route } = buildRoute(segments, cities, cityIdx, transport)
    const routeSet = new Set(route.filter((n) => !n.home).map((n) => n.city))
    const points: GlobePoint[] = cities
      .filter((c) => c.lat != null && c.lng != null)
      .map((c) => {
        const on = routeSet.has(c.city)
        const k = cityIdx[c.city]
        return {
          lat: c.lat!, lng: c.lng!, city: c.city, country: c.country, r: k?.r ?? c.region ?? null, city_: c,
          // Frame 19: planned stops mauve (--ac2 dark set), catalogue cities hunter.
          color: on ? '#D08795' : 'rgba(127,163,125,0.9)', radius: on ? 0.6 : 0.36, alt: on ? 0.02 : 0.01,
        }
      })
    const origin = route.find((n) => n.home)
    if (origin) {
      points.push({ lat: origin.lat, lng: origin.lng, city: origin.city, country: origin.country, r: null, home: true, color: '#ffffff', radius: 0.72, alt: 0.025 })
    }
    basePtsRef.current = points
    myArcsRef.current = buildArcs(route, transport)
    seasonalRef.current = seasonalHazards(segments, cities)
    g.labelsData(route as object[])
    paint()
  }, [cities, cityIdx, segments, transport]) // NOT rates — read via ratesRef so an FX edit doesn't repaint

  // ===== PATCH effects — the people layer (issue #9) =====
  useEffect(() => {
    (instRef.current as unknown as HtmlLayer | null)?.htmlElementsData(people.slice())
  }, [people])
  useEffect(() => {
    const layers = theirRoute ? theirRouteLayers(theirRoute.name, theirRoute.route, today) : { points: [], arcs: [] }
    theirPtsRef.current = layers.points
    theirArcsRef.current = layers.arcs
    paint()
  }, [theirRoute, today])

  // ===== PATCH effects — options and the feed =====
  useEffect(() => { instRef.current?.globeImageUrl(opts.day ? '/vendor/earth-day.jpg' : '/vendor/earth-night.jpg') }, [opts.day])
  useEffect(() => {
    const c = instRef.current?.controls()
    if (!c) return
    if (idleTimer.current) clearTimeout(idleTimer.current)
    c.autoRotate = opts.rotate
  }, [opts.rotate])
  useEffect(() => { applyBorders() }, [opts.borders])
  useEffect(() => {
    quakesRef.current = opts.hazards ? (quakes.data ?? []) : []
    paint()
  }, [opts.hazards, quakes.data])

  // Dark map chrome (frame 19): fixed dark-set colors in both themes, pill
  // controls at the 16px floor, Lucide icons.
  const chip = 'flex items-center gap-2 rounded-full border border-[rgba(216,224,229,.16)] bg-[rgba(11,15,20,.86)] px-3.5 py-2 text-base font-medium text-[#d8e0e5] backdrop-blur'
  return (
    <>
      <div ref={boxRef} className="absolute inset-0" />
      {/* below MapClient's top-right search button (frame 19) */}
      <div className="absolute right-4 top-[72px] z-10 flex flex-col items-end gap-1.5">
        <button className={chip + ' md:hidden'} onClick={() => setMenuOpen((o) => !o)}>
          <SlidersHorizontal aria-hidden className="size-4" strokeWidth={2} /> Map options
        </button>
        <div className={`${menuOpen ? 'flex' : 'hidden'} flex-col items-end gap-1.5 md:flex`}>
          {([
            ['rotate', RotateCw, `Spin: ${opts.rotate ? 'on' : 'off'}`],
            ['day', opts.day ? Sun : Moon, `View: ${opts.day ? 'day' : 'night'}`],
            ['borders', MapIcon, `Borders: ${opts.borders ? 'on' : 'off'}`],
            ['hazards', Zap, `Hazards: ${opts.hazards ? 'on' : 'off'}`],
          ] as const).map(([k, Icon, label]) => (
            <button key={k} className={chip} onClick={() => setOpts((o) => ({ ...o, [k]: !o[k] }))}>
              <Icon aria-hidden className="size-4" strokeWidth={2} />{label}
            </button>
          ))}
          <button className={chip} onClick={() => instRef.current?.pointOfView(POV, 600)}>
            <LocateFixed aria-hidden className="size-4" strokeWidth={2} />Reset view
          </button>
        </div>
      </div>
      {opts.hazards && hazInfo && (
        <button
          type="button"
          onClick={() => setHazHelp(true)}
          aria-label="What Hazards shows"
          className="absolute left-4 top-4 z-10 flex min-h-11 items-center gap-2 rounded-full border border-[rgba(216,224,229,.16)] bg-[rgba(11,15,20,.86)] px-3.5 py-2 text-base text-[#d8e0e5] backdrop-blur"
        >
          <Zap aria-hidden className="size-4 text-[#D9A85C]" strokeWidth={2} />
          {hazInfo.total} hazard{hazInfo.total === 1 ? '' : 's'}
          {hazInfo.quakes != null && <span className="text-[#D9A85C]"> · {hazInfo.quakes} live quake{hazInfo.quakes === 1 ? '' : 's'}</span>}
          {quakes.isFetching && hazInfo.quakes == null && <span className="text-[rgba(216,224,229,.6)]"> · checking quakes…</span>}
          <Info aria-hidden className="size-4 text-[rgba(216,224,229,.6)]" strokeWidth={2} />
        </button>
      )}
      <Legend people={people.length > 0 || !!theirRoute} />
      {countryFeat && <CountryPanel feat={countryFeat} countries={countries} cities={cities} segments={segments} rates={rates} onClose={() => setCountryFeat(null)} />}
      {hazard && <HazardPanel d={hazard} onClose={() => setHazard(null)} />}
      {hazHelp && (
        <HazardSourcesPanel
          quakeCount={hazInfo?.quakes ?? null}
          updatedAt={quakes.dataUpdatedAt}
          failed={quakes.isError}
          onClose={() => setHazHelp(false)}
        />
      )}
    </>
  )
}
