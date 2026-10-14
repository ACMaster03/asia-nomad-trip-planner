'use client'
import { useEffect, useRef } from 'react'
import Globe from 'globe.gl'
import type { RouteNode } from '@/lib/map/globeData'
import { angDeg, journeyCamera, legDuration, worldCamera, MAX_ALTITUDE, type Camera } from '@/lib/map/journeyCamera'

// The route globe on top of Trip (round 3b of the redesign; the phone's
// GlobeView and GlobeModel): home and the stops, a leg between each pair, the
// stop you are in ringed. It only draws. The frame around it
// (TripGlobeScaffold) decides where its centre sits on the screen, whether a
// finger may turn it, and when it may stop drawing. The visual language is
// FollowGlobe's (frame 30): travelled hunter, upcoming dashed mauve, now amber,
// home white. Not the planner's Globe.tsx, which carries the catalogue pins,
// the people layer and the hazards.

type Inst = InstanceType<typeof Globe>
type When = 'home' | 'past' | 'now' | 'next'
type Pt = RouteNode & { when: When }
type Arc = { startLat: number; startLng: number; endLat: number; endLng: number; past: boolean; shown: boolean }

export interface TripGlobeProps {
  route: RouteNode[]
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

const HUNTER = '#7fa37d'
const AMBER = '#d9a85c'
const MAUVE = 'rgba(208,135,149,0.95)'
const MAUVE_ARC = 'rgba(208,135,149,0.6)'
const HOME = '#ffffff'
// Globe radius is 100 units: from city level to as far out as the world view goes.
const MIN_DISTANCE = 130
const MAX_DISTANCE = (1 + MAX_ALTITUDE) * 100

/** Each place's moment: home, behind you, where you are, or ahead. The last stop reached is "now". */
function classify(route: RouteNode[], todayIso: string): Pt[] {
  const stops = route.filter((n) => !n.home)
  let nowIdx = -1
  stops.forEach((s, i) => { if (s.arrive && s.arrive <= todayIso) nowIdx = i })
  return route.map((n) => {
    if (n.home) return { ...n, when: 'home' as When }
    const i = stops.indexOf(n)
    return { ...n, when: i < nowIdx ? 'past' : i === nowIdx ? 'now' : 'next' }
  })
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const stillMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export default function TripGlobe({ route, todayIso, interactive, paused, camera, cameraNonce, replayNonce, onReplayEnd, onPickStop }: TripGlobeProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const instRef = useRef<Inst | null>(null)
  const readyRef = useRef(false)
  const ptsRef = useRef<Pt[]>([])
  const arcsRef = useRef<Arc[]>([])
  const cameraRef = useRef<'journey' | 'world'>(camera)
  const playingRef = useRef(false)
  const aliveRef = useRef(true)
  const pickRef = useRef(onPickStop)
  const endRef = useRef(onReplayEnd)
  useEffect(() => { pickRef.current = onPickStop }, [onPickStop])
  useEffect(() => { endRef.current = onReplayEnd }, [onReplayEnd])

  const target = (which: 'journey' | 'world'): Camera => {
    const pts = ptsRef.current
    return which === 'world' ? worldCamera(pts) : journeyCamera(pts)
  }
  const fly = (c: Camera, ms: number) => {
    const g = instRef.current
    if (!g || !readyRef.current) return
    g.pointOfView(c, stillMotion() ? 0 : ms)
  }
  const paintArcs = () => {
    instRef.current?.arcsData(arcsRef.current.filter((a) => a.shown) as object[])
  }

  // Build once; everything after patches the live instance.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    aliveRef.current = true
    const g = new Globe(el)
      .globeImageUrl('/vendor/earth-day.jpg')
      .backgroundColor('rgba(0,0,0,0)')
      .width(el.clientWidth)
      .height(el.clientHeight)
      .showAtmosphere(true)
      .atmosphereColor(HUNTER)
      .atmosphereAltitude(0.18)
      .pointsData([]).pointLat('lat').pointLng('lng')
      .pointColor(((d: object) => ({ home: HOME, past: HUNTER, now: AMBER, next: MAUVE })[(d as Pt).when]) as never)
      .pointAltitude(((d: object) => ((d as Pt).when === 'home' ? 0.02 : 0.015)) as never)
      .pointRadius(((d: object) => ({ home: 0.6, past: 0.55, now: 0.7, next: 0.45 })[(d as Pt).when]) as never)
      .pointLabel(((d: object) => `<div style="background:var(--sf);color:var(--tx);border:1px solid var(--ln);border-radius:12px;padding:6px 10px;font:14px var(--font-work-sans),sans-serif">${String((d as Pt).city).replace(/[&<>]/g, '')}</div>`) as never)
      .onPointClick(((d: object) => { const p = d as Pt; if (!p.home) pickRef.current?.(p) }) as never)
      .pointsTransitionDuration(0)
      .arcsData([]).arcStartLat('startLat').arcStartLng('startLng').arcEndLat('endLat').arcEndLng('endLng')
      .arcColor(((d: object) => ((d as Arc).past ? HUNTER : MAUVE_ARC)) as never)
      .arcStroke(((d: object) => ((d as Arc).past ? 0.45 : 0.32)) as never)
      .arcAltitudeAutoScale(0.35)
      .arcDashLength(((d: object) => ((d as Arc).past ? 1 : 0.6)) as never)
      .arcDashGap(((d: object) => ((d as Arc).past ? 0 : 0.25)) as never)
      .arcDashAnimateTime(((d: object) => ((d as Arc).past ? 0 : 4000)) as never)
      .arcsTransitionDuration(0)
      .ringsData([]).ringLat('lat').ringLng('lng')
      .ringColor((() => AMBER) as never).ringMaxRadius(4).ringPropagationSpeed(1.2).ringRepeatPeriod(1400)
      .onGlobeReady(() => {
        readyRef.current = true
        g.pointOfView(target(cameraRef.current), 0)
      })
    const c = g.controls()
    c.autoRotate = false
    c.enableDamping = true
    c.minDistance = MIN_DISTANCE
    c.maxDistance = MAX_DISTANCE
    instRef.current = g
    const ro = new ResizeObserver(() => { g.width(el.clientWidth); g.height(el.clientHeight) })
    ro.observe(el)
    return () => {
      aliveRef.current = false
      ro.disconnect()
      readyRef.current = false
      g._destructor()
      instRef.current = null
    }
  }, [])

  // The journey: the places, the legs, the ring on the stop you are in.
  useEffect(() => {
    const g = instRef.current
    if (!g) return
    const first = ptsRef.current.length === 0
    const pts = classify(route, todayIso)
    ptsRef.current = pts
    const arcs: Arc[] = []
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1]
      if (a.lat === b.lat && a.lng === b.lng) continue
      arcs.push({ startLat: a.lat, startLng: a.lng, endLat: b.lat, endLng: b.lng, past: b.when === 'past' || b.when === 'now', shown: true })
    }
    arcsRef.current = arcs
    g.pointsData(pts as object[])
    g.ringsData(pts.filter((p) => p.when === 'now') as object[])
    if (!playingRef.current) paintArcs()
    // The first route frames the globe; a later edit does not snap the view back.
    if (first && pts.length && !playingRef.current) fly(target(cameraRef.current), 0)
  }, [route, todayIso])

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
    const g = instRef.current
    if (!g) return
    if (paused) g.pauseAnimation()
    else g.resumeAnimation()
  }, [paused])

  // The replay: from home, leg by leg, each leg drawn as it is flown; then the whole journey.
  useEffect(() => {
    if (!replayNonce) return
    const pts = ptsRef.current
    if (pts.length < 2 || playingRef.current) { endRef.current?.(); return }
    playingRef.current = true
    const still = stillMotion()
    const run = async () => {
      for (const a of arcsRef.current) a.shown = false
      paintArcs()
      fly({ lat: pts[0].lat, lng: pts[0].lng, altitude: 1.3 }, 600)
      await sleep(still ? 0 : 650)
      for (let i = 1; i < pts.length && aliveRef.current; i++) {
        const from = pts[i - 1], to = pts[i]
        const ms = still ? 0 : legDuration(from, to)
        fly({ lat: to.lat, lng: to.lng, altitude: 1 + Math.min(1.2, angDeg(from, to) / 60) }, ms)
        const arc = arcsRef.current[i - 1]
        if (arc) {
          await sleep(Math.round(ms * 0.35))
          arc.shown = true
          paintArcs()
          await sleep(ms - Math.round(ms * 0.35) + 150)
        } else {
          await sleep(ms + 150)
        }
      }
      for (const a of arcsRef.current) a.shown = true
      paintArcs()
      playingRef.current = false
      if (aliveRef.current) { fly(target(cameraRef.current), 900); endRef.current?.() }
    }
    void run()
  }, [replayNonce])

  return <div ref={boxRef} className="h-full w-full" aria-label="The journey on a globe" />
}
