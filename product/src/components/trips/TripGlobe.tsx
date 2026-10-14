'use client'
import { useEffect, useRef } from 'react'
import Globe from 'globe.gl'
import type { RouteNode } from '@/lib/map/globeData'
import { flightFor } from '@/lib/map/globeData'
import { angDeg, geodesic, journeyCamera, legDuration, worldCamera, MAX_ALTITUDE, type Camera } from '@/lib/map/journeyCamera'
import { globeTheme, type GlobeTheme } from '@/lib/map/globeTheme'
import { CONTINENTS, continentOpacity, countryLabels, normCountry, pickCountryLabels, stopNamesShown, outerRings, type CountryLabel, type GeoFeature } from '@/lib/map/globeNames'
import type { TransportLeg } from '@/lib/trips/types'

// The route globe on top of Trip (round 3b of the redesign), drawn as the
// phone's GlobeView draws it (Tokens.swift "the globe", mock round 5): a pale
// sea, sage land from the country shapes with a white rim along the coasts and
// faint borders, your journey's countries a shade darker, continent names far
// out and country names closer in, the route in --ac2Deep over a canvas halo
// (dashed where it is still ahead, dotted on the ground), the stops as dots
// with their names in the serif italic, home a small square, a warm rim around
// the globe. The engine is the web's (globe.gl, as the follower page and the
// old Map page); the look is the phone's. Not drawn: the night side, the seas'
// names, the plane that flies the replay.
//
// It only draws. The frame around it (TripGlobeScaffold) decides where its
// centre sits on the screen, whether a finger may turn it, and when it may
// stop drawing.

type Inst = InstanceType<typeof Globe>
type When = 'home' | 'past' | 'now' | 'next'
type Pt = RouteNode & { when: When; i: number }
type Leg = { pts: [number, number][]; upcoming: boolean; ground: boolean; shown: boolean; i: number }
/** One line on the globe: a leg of the route, or a stretch of coast. */
type Path = { kind: 'leg'; pts: [number, number][]; leg: Leg } | { kind: 'coast'; pts: number[][] }
type Html =
  | { kind: 'stop'; lat: number; lng: number; pt: Pt }
  | { kind: 'country'; lat: number; lng: number; label: CountryLabel; mine: boolean }
  | { kind: 'continent'; lat: number; lng: number; name: string }

export interface TripGlobeProps {
  route: RouteNode[]
  transport: TransportLeg[]
  todayIso: string
  /** a finger may turn and zoom it (the open globe) */
  interactive: boolean
  /** stop drawing (scrolled out of sight) */
  paused: boolean
  /** where to look; `cameraNonce` flies there again even when it has not changed */
  camera: 'journey' | 'world'
  cameraNonce: number
  /** bump to replay the journey leg by leg; `onReplayEnd` when the last stop is reached */
  replayNonce: number
  onReplayEnd?: () => void
  onPickStop?: (node: RouteNode) => void
}

// The layers globe.gl leaves untyped in its .d.ts; the slice used here.
interface Loose {
  globeMaterial(): { color: { set(c: string): void }; shininess: number }
  pathsData(d: object[]): Loose
  pathPoints(a: string): Loose
  pathPointLat(f: (p: object) => number): Loose
  pathPointLng(f: (p: object) => number): Loose
  pathPointAlt(f: (p: object) => number): Loose
  pathColor(f: (d: object) => string): Loose
  pathStroke(f: (d: object) => number): Loose
  pathDashLength(f: (d: object) => number): Loose
  pathDashGap(f: (d: object) => number): Loose
  pathResolution(a: number): Loose
  pathTransitionDuration(ms: number): Loose
  polygonsTransitionDuration(ms: number): Loose
  htmlElementsData(d: object[]): Loose
  htmlLat(a: string): Loose
  htmlLng(a: string): Loose
  htmlAltitude(a: number): Loose
  htmlElement(f: (d: object) => HTMLElement): Loose
  htmlElementVisibilityModifier(f: (el: HTMLElement, visible: boolean) => void): Loose
  htmlTransitionDuration(ms: number): Loose
}

const MIN_DISTANCE = 130
const MAX_DISTANCE = (1 + MAX_ALTITUDE) * 100
const SERIF = "var(--font-lora), Georgia, serif"
const SANS = "var(--font-work-sans), 'Work Sans', sans-serif"
/** A leg with no transport typed reads as a flight over 600 km, as ground under (the phone's rule). */
const FLIGHT_KM = 600
let featsCache: GeoFeature[] | null = null
let featsPromise: Promise<GeoFeature[]> | null = null
function loadCountries(): Promise<GeoFeature[]> {
  if (featsCache) return Promise.resolve(featsCache)
  featsPromise ??= fetch('/vendor/countries.geojson').then((r) => r.json()).then((j) => (featsCache = (j?.features ?? []) as GeoFeature[])).catch(() => [])
  return featsPromise
}

/** Each place's moment: home, behind you, where you are, or ahead. The last stop reached is "now". */
function classify(route: RouteNode[], todayIso: string): Pt[] {
  const stops = route.filter((n) => !n.home)
  let nowIdx = -1
  stops.forEach((s, i) => { if (s.arrive && s.arrive <= todayIso) nowIdx = i })
  return route.map((n, i) => {
    if (n.home) return { ...n, when: 'home' as When, i }
    const k = stops.indexOf(n)
    return { ...n, when: k < nowIdx ? 'past' : k === nowIdx ? 'now' : 'next', i }
  })
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const stillMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const isDark = () => typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'
const haloShadow = (c: string) => [[-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5], [-1.1, -1.1], [1.1, 1.1], [-1.1, 1.1], [1.1, -1.1]].map(([x, y]) => `${x}px ${y}px 0 ${c}`).join(',')

/** A stop's mark and name, as the phone draws them: a dot right of which the name sits in the serif italic. */
function stopElement(pt: Pt, t: GlobeTheme, onTap: (n: RouteNode) => void): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = 'position:relative;width:0;height:0;pointer-events:none'
  el.dataset.kind = 'stop'
  el.dataset.when = pt.when
  const r = pt.when === 'now' ? 6.5 : 4.5
  const mark = document.createElement(pt.when === 'home' ? 'span' : 'button')
  if (pt.when !== 'home') { (mark as HTMLButtonElement).type = 'button'; mark.setAttribute('aria-label', pt.city) }
  const base = `position:absolute;box-sizing:border-box;pointer-events:auto;cursor:pointer;padding:0;`
  if (pt.when === 'home') mark.style.cssText = `${base}left:-4px;top:-4px;width:8px;height:8px;background:${t.tx2};border:0`
  else if (pt.when === 'next') mark.style.cssText = `${base}left:${-r}px;top:${-r}px;width:${2 * r}px;height:${2 * r}px;border-radius:50%;background:${t.sf};border:2px solid ${t.route}`
  else if (pt.when === 'past') mark.style.cssText = `${base}left:${-r}px;top:${-r}px;width:${2 * r}px;height:${2 * r}px;border-radius:50%;background:${t.route};border:0`
  else mark.style.cssText = `${base}left:${-r}px;top:${-r}px;width:${2 * r}px;height:${2 * r}px;border-radius:50%;background:${t.route};border:2.5px solid ${t.sf}`
  if (pt.when !== 'home') {
    mark.addEventListener('pointerdown', (ev) => ev.stopPropagation())
    mark.addEventListener('pointerup', (ev) => ev.stopPropagation())
    mark.addEventListener('click', (ev) => { ev.stopPropagation(); onTap(pt) })
  }
  el.appendChild(mark)
  if (pt.when === 'now') {
    const ring = document.createElement('span')
    ring.className = 'lv-globe-now'
    ring.style.cssText = `position:absolute;left:-7px;top:-7px;width:14px;height:14px;border-radius:50%;border:2px solid ${t.route};opacity:.5`
    el.appendChild(ring)
  }
  const name = document.createElement('span')
  name.className = 'lv-globe-name'
  const fs = pt.when === 'now' ? 14 : 12.5
  name.textContent = pt.when === 'home' ? `${pt.city} · home` : pt.city
  name.style.cssText = `position:absolute;left:11px;top:${-fs * 0.72}px;white-space:nowrap;pointer-events:auto;cursor:pointer;font:italic 500 ${fs}px/1.2 ${SERIF};color:${pt.when === 'now' ? t.tx : t.tx2};text-shadow:${haloShadow(t.halo)}`
  if (pt.when !== 'home') name.addEventListener('click', (ev) => { ev.stopPropagation(); onTap(pt) })
  el.appendChild(name)
  return el
}

function countryElement(label: Pick<CountryLabel, 'name'>, mine: boolean, t: GlobeTheme): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = 'position:relative;width:0;height:0;pointer-events:none'
  el.dataset.kind = 'country'
  const s = document.createElement('span')
  s.textContent = label.name
  s.style.cssText = `position:absolute;left:0;top:0;transform:translate(-50%,-50%);white-space:nowrap;font:600 10px/1 ${SANS};letter-spacing:.09em;text-transform:uppercase;color:${mine ? t.nameMine : t.nameCountry}`
  el.appendChild(s)
  return el
}

function continentElement(name: string, t: GlobeTheme): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = 'position:relative;width:0;height:0;pointer-events:none'
  el.dataset.kind = 'continent'
  const s = document.createElement('span')
  s.textContent = name
  s.style.cssText = `position:absolute;left:0;top:0;transform:translate(-50%,-50%);white-space:nowrap;font:600 13px/1 ${SANS};letter-spacing:.32em;text-transform:uppercase;color:${t.nameContinent}`
  el.appendChild(s)
  return el
}

export default function TripGlobe({ route, transport, todayIso, interactive, paused, camera, cameraNonce, replayNonce, onReplayEnd, onPickStop }: TripGlobeProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const instRef = useRef<Inst | null>(null)
  const readyRef = useRef(false)
  const themeRef = useRef<GlobeTheme>(globeTheme(false))
  const ptsRef = useRef<Pt[]>([])
  const legsRef = useRef<Leg[]>([])
  const featsRef = useRef<GeoFeature[]>([])
  const labelsRef = useRef<CountryLabel[]>([])
  const mineRef = useRef<Set<string>>(new Set())
  const cameraRef = useRef<'journey' | 'world'>(camera)
  const playingRef = useRef(false)
  const aliveRef = useRef(true)
  const pickRef = useRef(onPickStop)
  const endRef = useRef(onReplayEnd)
  useEffect(() => { pickRef.current = onPickStop }, [onPickStop])
  useEffect(() => { endRef.current = onReplayEnd }, [onReplayEnd])

  const loose = () => instRef.current as unknown as Loose | null
  const target = (which: 'journey' | 'world'): Camera => (which === 'world' ? worldCamera(ptsRef.current) : journeyCamera(ptsRef.current))
  const fly = (c: Camera, ms: number) => {
    const g = instRef.current
    if (!g || !readyRef.current) return
    g.pointOfView(c, stillMotion() ? 0 : ms)
  }

  // ---- paint: the arcs, the land, the names; each reads the refs ----
  // The lines on the globe, in one layer: the coasts' white rim under the route's legs.
  const paintPaths = () => {
    const g = loose()
    if (!g) return
    const coasts: Path[] = featsRef.current.flatMap((f) => outerRings(f).filter((r) => r.length > 8).map((r) => ({ kind: 'coast' as const, pts: r })))
    const legs: Path[] = legsRef.current.filter((l) => l.shown).map((l) => ({ kind: 'leg' as const, pts: l.pts, leg: l }))
    g.pathsData([...coasts, ...legs] as object[])
  }
  const paintArcs = paintPaths
  const paintLand = () => {
    const g = instRef.current
    if (!g) return
    g.polygonsData(featsRef.current.slice() as object[])
    paintPaths()
  }
  // Which names show at this height (the phone's drawNames): continents far out, fading as you
  // come closer; a country's name sized by how big the country is on screen and shown once it
  // is big enough for it (your journey's countries first, then the biggest); the stops' names
  // near. Worked out once per height and applied to each element in globe.gl's own per-frame
  // visibility pass, so no timing can miss it.
  const rulesRef = useRef<{ alt: number; rPx: number; sizes: Map<string, number>; cf: number; co: number; stopNames: boolean } | null>(null)
  // The names placed so far this frame, as boxes on the screen: a name that would sit on
  // another is left out (the phone's `hit`). The frame counter comes from the loop below.
  const frameRef = useRef(0)
  const boxesRef = useRef<{ frame: number; boxes: { x: number; y: number; w: number; h: number }[] }>({ frame: -1, boxes: [] })
  const vehicleRef = useRef<HTMLDivElement | null>(null)
  const pausedRef = useRef(false)
  const rulesFor = (alt: number) => {
    const cached = rulesRef.current
    if (cached && Math.abs(cached.alt - alt) < 0.03) return cached
    const el = boxRef.current
    // The globe's radius on screen: the camera looks through a 50° field of view, top to bottom.
    const rPx = (el?.clientHeight ?? 700) / (2 * (1 + alt) * Math.tan((25 * Math.PI) / 180))
    const cf = Math.max(0, Math.min(1, (3.3 - alt) / 0.6))
    const sizes = new Map<string, number>()
    if (cf > 0) {
      let room = 48
      for (const l of pickCountryLabels(labelsRef.current, alt, mineRef.current)) {
        const px = rPx * l.size * (Math.PI / 180)
        const fs = Math.max(8.5, Math.min(13, px * 0.085))
        if (px < fs * (mineRef.current.has(normCountry(l.name)) ? 2 : 3) || room <= 0) continue
        sizes.set(l.name, fs)
        room--
      }
    }
    const rules = { alt, rPx, sizes, cf, co: continentOpacity(alt), stopNames: stopNamesShown(alt) }
    rulesRef.current = rules
    return rules
  }
  /** Where globe.gl put the element this frame, read back from its transform. */
  const screenXY = (node: HTMLElement): { x: number; y: number } | null => {
    const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*$/.exec(node.style.transform)
    return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null
  }
  /** Claims the box for a name; false when another name already has that place. */
  const claim = (x: number, y: number, w: number, h: number) => {
    const b = boxesRef.current
    if (b.frame !== frameRef.current) { b.frame = frameRef.current; b.boxes = [] }
    const box = { x: x - w / 2, y: y - h / 2, w, h }
    if (b.boxes.some((o) => box.x < o.x + o.w && box.x + box.w > o.x && box.y < o.y + o.h && box.y + box.h > o.y)) return false
    b.boxes.push(box)
    return true
  }
  // The band under the kicker and the name, where no name on the globe should sit.
  const TOP_BAND = 118
  const applyRules = (node: HTMLElement, r: ReturnType<typeof rulesFor>) => {
    const el = boxRef.current
    if (!el) return
    const visible = node.dataset.occluded !== '1'
    const kind = node.dataset.kind
    const at = screenXY(node)
    // Near the globe's edge the names bunch up and foreshorten: leave them out (the phone's `facing`).
    const edge = at ? Math.hypot(at.x - el.clientWidth / 2, at.y - el.clientHeight / 2) > r.rPx * 0.92 : false
    let show = visible && !edge
    if (kind === 'continent') {
      node.style.opacity = String(r.co)
      show = show && r.co > 0 && !!at && at.y > TOP_BAND && claim(at.x, at.y, (node.textContent?.length ?? 4) * 13 * 0.98, 20)
    } else if (kind === 'country') {
      const fs = r.sizes.get(node.dataset.name ?? '')
      show = show && !!fs && !!at && at.y > TOP_BAND
      if (fs) { const s = node.firstElementChild as HTMLElement | null; if (s) { s.style.fontSize = fs + 'px'; s.style.opacity = String(r.cf) } }
      if (show && fs && at) show = claim(at.x, at.y, (node.dataset.name?.length ?? 4) * fs * 0.72 + 6, fs + 6)
    } else if (kind === 'stop') {
      const name = node.querySelector<HTMLElement>('.lv-globe-name')
      const when = node.dataset.when
      if (name) {
        let named = r.stopNames || when === 'home' || when === 'now'
        if (named && at && when !== 'now' && at.y < TOP_BAND - 24) named = false
        // The stop's name claims its place first, to the right of the mark.
        if (named && at) named = claim(at.x + 11 + (name.textContent?.length ?? 4) * 6.5 * 0.5, at.y, (name.textContent?.length ?? 4) * 6.5 + 4, 16)
        name.style.display = named ? '' : 'none'
      }
      show = visible
    }
    node.style.visibility = show ? 'visible' : 'hidden'
  }
  const paintNames = () => {
    const g = loose()
    if (!g) return
    const items: Html[] = [
      ...ptsRef.current.map((pt) => ({ kind: 'stop' as const, lat: pt.lat, lng: pt.lng, pt })),
      ...CONTINENTS.map((c) => ({ kind: 'continent' as const, lat: c.lat, lng: c.lng, name: c.name })),
      ...labelsRef.current.map((label) => ({ kind: 'country' as const, lat: label.lat, lng: label.lng, label, mine: mineRef.current.has(normCountry(label.name)) })),
    ]
    g.htmlElementsData(items as object[])
    rulesRef.current = null
  }
  const applyTheme = () => {
    const g = instRef.current, l = loose()
    if (!g || !l) return
    const t = themeRef.current
    l.globeMaterial().color.set(t.ocean)
    g.atmosphereColor(t.glow).atmosphereAltitude(t.glowAltitude)
    paintLand()
    paintArcs()
    paintNames()
  }

  // Build once; everything after patches the live instance.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    aliveRef.current = true
    themeRef.current = globeTheme(isDark())
    const t = () => themeRef.current
    const g = new Globe(el)
      .backgroundColor('rgba(0,0,0,0)')
      .width(el.clientWidth)
      .height(el.clientHeight)
      .showAtmosphere(true)
      .atmosphereColor(t().glow)
      .atmosphereAltitude(t().glowAltitude)
      // the land: the country shapes, your journey's a shade darker, faint borders
      .polygonsData([])
      .polygonCapColor(((f: object) => (mineRef.current.has(normCountry((f as GeoFeature).properties?.name)) ? t().mine : t().land)) as never)
      .polygonSideColor(() => 'rgba(0,0,0,0)')
      .polygonStrokeColor((() => t().border) as never)
      .polygonAltitude(0.005)
      .onGlobeReady(() => {
        readyRef.current = true
        g.pointOfView(target(cameraRef.current), 0)
      })

    const l = g as unknown as Loose
    l.globeMaterial().color.set(t().ocean)
    l.globeMaterial().shininess = 0
    l.polygonsTransitionDuration(0)
    // The lines: the coasts' white rim (the phone's globeShore) just over the land's edge, and the
    // route's legs over it, along the great circle so they hug the globe: dashed where still
    // ahead, dotted on the ground. (The phone's canvas halo under the route is left out: as a
    // tube it swallowed the line.)
    const path = (d: object) => d as Path
    l.pathsData([]).pathPoints('pts').pathPointLat((p) => (p as number[])[1]).pathPointLng((p) => (p as number[])[0])
      .pathPointAlt((d) => (path(d).kind === 'leg' ? 0.011 : 0.0055))
      .pathColor((d) => { const p = path(d); return p.kind === 'coast' ? t().shore : p.leg.upcoming ? t().route + 'd9' : t().route })
      .pathStroke((d) => { const p = path(d); return p.kind === 'coast' ? 0.8 : p.leg.ground ? 1.7 : 1.4 })
      .pathDashLength((d) => { const p = path(d); return p.kind === 'coast' ? 1 : p.leg.ground ? 0.012 : p.leg.upcoming ? 0.07 : 1 })
      .pathDashGap((d) => { const p = path(d); return p.kind === 'coast' ? 0 : p.leg.ground ? 0.045 : p.leg.upcoming ? 0.055 : 0 })
      .pathResolution(1).pathTransitionDuration(0)
    l.htmlElementsData([]).htmlLat('lat').htmlLng('lng').htmlAltitude(0.012).htmlTransitionDuration(0)
      .htmlElement((d) => {
        const h = d as Html
        if (h.kind === 'stop') return stopElement(h.pt, t(), (n) => pickRef.current?.(n))
        if (h.kind === 'country') { const e = countryElement(h.label, h.mine, t()); e.dataset.name = h.label.name; return e }
        return continentElement(h.name, t())
      })
      .htmlElementVisibilityModifier((node, visible) => { node.dataset.occluded = visible ? '' : '1' })
    // Lit flat, as the phone's globe is: the even light alone, at full strength, every colour drawn as it is.
    const lights = g.lights() as unknown as { type: string; intensity: number; color: { set(c: number): void } }[]
    const ambient = lights.find((l) => l.type === 'AmbientLight')
    if (ambient) { ambient.intensity = Math.PI; ambient.color.set(0xffffff); g.lights([ambient as unknown as (typeof lights)[number]] as never) }
    const c = g.controls()
    c.autoRotate = false
    c.enableDamping = true
    c.minDistance = MIN_DISTANCE
    c.maxDistance = MAX_DISTANCE
    instRef.current = g
    // Once per frame: the names' boxes start afresh and every name is placed again, in the
    // order they were given (the stops, the continents, then the countries, biggest first).
    let raf = 0
    const tick = () => {
      frameRef.current++
      if (!pausedRef.current && readyRef.current) {
        const r = rulesFor(g.pointOfView().altitude ?? 2)
        el.querySelectorAll<HTMLElement>('[data-kind]').forEach((node) => applyRules(node, r))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    // The plane (or the dot on the ground) that flies the replay (the phone's drawVehicle).
    const vehicle = document.createElement('div')
    vehicle.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;display:none;z-index:2;will-change:transform'
    vehicle.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" style="position:absolute;left:-11px;top:-11px;overflow:visible;filter:drop-shadow(0 2px 1.5px rgba(0,0,0,.22))" aria-hidden="true"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" fill="${t().tx}" stroke="${t().sf}" stroke-width="1.6" stroke-linejoin="round"/></svg>`
    el.appendChild(vehicle)
    vehicleRef.current = vehicle
    const ro = new ResizeObserver(() => { g.width(el.clientWidth); g.height(el.clientHeight) })
    ro.observe(el)
    // The country shapes, once per page.
    void loadCountries().then((feats) => {
      if (!aliveRef.current) return
      featsRef.current = feats
      labelsRef.current = countryLabels(feats)
      paintLand()
      paintNames()
    })
    // Dark and light: the theme attribute flips on <html>.
    const mo = new MutationObserver(() => {
      const next = globeTheme(isDark())
      if (next === themeRef.current) return
      themeRef.current = next
      applyTheme()
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      aliveRef.current = false
      cancelAnimationFrame(raf)
      vehicle.remove()
      vehicleRef.current = null
      mo.disconnect()
      ro.disconnect()
      readyRef.current = false
      g._destructor()
      instRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The journey: the places, the legs, your countries.
  useEffect(() => {
    const g = instRef.current
    if (!g) return
    const first = ptsRef.current.length === 0
    const pts = classify(route, todayIso)
    ptsRef.current = pts
    mineRef.current = new Set(route.map((n) => normCountry(n.country)).filter(Boolean))
    rulesRef.current = null
    const legs: Leg[] = []
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1]
      if (a.lat === b.lat && a.lng === b.lng) continue
      const t = flightFor(transport, a.city, b.city)
      const km = angDeg(a, b) * 111.2
      const flight = t ? (t.type || '').toLowerCase() === 'flight' : km > FLIGHT_KM
      legs.push({ pts: geodesic(a, b), upcoming: b.when === 'next', ground: !flight, shown: true, i })
    }
    legsRef.current = legs
    if (!playingRef.current) paintArcs()
    paintLand()
    paintNames()
    // The first route frames the globe; a later edit does not snap the view back.
    if (first && pts.length && !playingRef.current) fly(target(cameraRef.current), 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, transport, todayIso])

  // The frame's asks: where to look, whether a finger may turn it, whether to draw.
  useEffect(() => {
    cameraRef.current = camera
    if (!playingRef.current) fly(target(camera), 650)
  }, [camera, cameraNonce])
  useEffect(() => {
    const g = instRef.current
    if (!g) return
    g.enablePointerInteraction(interactive)
    const c = g.controls()
    c.enabled = interactive
    c.enableZoom = interactive
    c.enableRotate = interactive
  }, [interactive])
  useEffect(() => {
    pausedRef.current = paused
    const g = instRef.current
    if (!g) return
    if (paused) g.pauseAnimation()
    else g.resumeAnimation()
  }, [paused])

  /** Moves the plane along a leg's great circle over `ms`; returns a stop that hides it. */
  const flyVehicle = (leg: Leg, ms: number) => {
    const g = instRef.current, v = vehicleRef.current
    if (!g || !v || leg.pts.length < 2) return () => {}
    const svg = v.firstElementChild as SVGElement | null
    if (svg) { svg.style.display = leg.ground ? 'none' : ''; }
    v.style.display = ''
    if (leg.ground) v.style.cssText += `;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:${themeRef.current.tx};border:2px solid ${themeRef.current.sf}`
    const start = performance.now()
    let raf = 0
    let heading: number | null = null
    const n = leg.pts.length - 1
    const place = (t: number) => {
      const f = t * n, i = Math.min(n - 1, Math.floor(f)), k = f - i
      const [lng0, lat0] = leg.pts[i], [lng1, lat1] = leg.pts[i + 1]
      const p = g.getScreenCoords(lat0 + (lat1 - lat0) * k, lng0 + (lng1 - lng0) * k, 0.02)
      if (!p) return
      // The heading is the way the route goes from here, both ends read in the same frame:
      // read from one frame to the next it carried the camera's own flight, and the plane
      // spun round and round (Petra, 14 Oct). Smoothed a little between frames.
      const [lngA, latA] = leg.pts[i + 1]
      const ahead = g.getScreenCoords(latA, lngA, 0.02)
      if (ahead && Math.hypot(ahead.x - p.x, ahead.y - p.y) > 0.5) {
        const want = (Math.atan2(ahead.y - p.y, ahead.x - p.x) * 180) / Math.PI
        if (heading === null) heading = want
        else {
          let d = want - heading
          while (d > 180) d -= 360
          while (d < -180) d += 360
          heading += d * 0.3
        }
      }
      // The plane's nose points up and to the right in the icon: turn it by 45° less.
      v.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${(heading ?? 0) - 45}deg)`
    }
    place(0)
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / ms)
      place(t)
      if (t < 1 && aliveRef.current) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(raf); v.style.display = 'none'; v.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;display:none;z-index:2' }
  }

  // The replay: from home, leg by leg, each leg drawn as it is flown; then the whole journey.
  useEffect(() => {
    if (!replayNonce) return
    const pts = ptsRef.current
    if (pts.length < 2 || playingRef.current) { endRef.current?.(); return }
    playingRef.current = true
    const still = stillMotion()
    const run = async () => {
      for (const l of legsRef.current) l.shown = false
      paintArcs()
      fly({ lat: pts[0].lat, lng: pts[0].lng, altitude: 1.3 }, 600)
      await sleep(still ? 0 : 650)
      for (let i = 1; i < pts.length && aliveRef.current; i++) {
        const from = pts[i - 1], to = pts[i]
        const ms = still ? 0 : legDuration(from, to)
        fly({ lat: to.lat, lng: to.lng, altitude: 1 + Math.min(1.2, angDeg(from, to) / 60) }, ms)
        const leg = legsRef.current.find((l) => l.i === i - 1)
        if (leg && !still) {
          // The leg draws itself under the plane as it flies, a little behind it.
          const stop = flyVehicle(leg, ms)
          await sleep(Math.round(ms * 0.35))
          leg.shown = true
          paintArcs()
          await sleep(ms - Math.round(ms * 0.35) + 150)
          stop()
        } else if (leg) {
          leg.shown = true
          paintArcs()
          await sleep(150)
        } else {
          await sleep(ms + 150)
        }
      }
      for (const l of legsRef.current) l.shown = true
      paintArcs()
      playingRef.current = false
      if (aliveRef.current) { fly(target(cameraRef.current), 900); endRef.current?.() }
    }
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayNonce])

  return <div ref={boxRef} className="h-full w-full" aria-label="The journey on a globe" />
}
