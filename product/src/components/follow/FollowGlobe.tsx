'use client'
import { useEffect, useRef } from 'react'
import Globe from 'globe.gl'
import type { SharedRouteStop } from '@/lib/follow/api'

// The follower page's globe — deliberately NOT a wrapper around the planner's
// Globe.tsx (that one is coupled to catalogue costs, hazards and the app
// router). This renders only what the sanitized summary RPC returns: route
// points, arcs between consecutive stops, and a pulsing ring on the last-seen
// stop. Phone-first: auto-rotating, drag-to-spin, pinch/scroll-to-zoom.
//
// Visual language (mock 07 legend): travelled = solid teal, upcoming = faint
// dashed, last seen = pulsing amber ring (grey + slow when the feed has been
// quiet for days).

type Inst = InstanceType<typeof Globe>

interface Props {
  route: SharedRouteStop[]
  currentCity: string | null
  /** local ISO date on the viewer's clock — splits route into past/upcoming */
  todayISO: string
  /** ring position; falls back to currentCity */
  lastSeenCity?: string | null
  /** no shared events in days → ring goes grey and slow (mock 07 quiet state) */
  stale?: boolean
}

const TEAL = '#0d9488'
const AMBER = '#f0a83c'
const GREY = '#9a9aa2'
const FUTURE = 'rgba(148,163,184,0.75)'
const FUTURE_ARC = 'rgba(148,163,184,0.5)'

type Arc = { startLat: number; startLng: number; endLat: number; endLng: number; past: boolean }

export default function FollowGlobe({ route, currentCity, todayISO, lastSeenCity, stale }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const instRef = useRef<Inst | null>(null)
  const readyRef = useRef(false)
  const focusRef = useRef<{ lat: number; lng: number } | null>(null)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // pointOfView before the globe finishes its async init gets stomped by the
  // camera setup (worse under StrictMode's double-mount) — so the flight is
  // deferred until onGlobeReady and re-applied on every data change.
  const applyFocus = () => {
    const g = instRef.current
    if (g && readyRef.current && focusRef.current) {
      g.pointOfView({ ...focusRef.current, altitude: 1.9 }, 800)
    }
  }

  useEffect(() => {
    if (!boxRef.current) return
    const el = boxRef.current
    const g = new Globe(el)
      .globeImageUrl('/vendor/earth-day.jpg')
      .backgroundColor('rgba(0,0,0,0)')
      .width(el.clientWidth)
      .height(el.clientHeight)
      .showAtmosphere(true)
      .atmosphereColor('#4fd1c5')
      .atmosphereAltitude(0.18)
      .onGlobeReady(() => {
        readyRef.current = true
        applyFocus()
      })
    // Slow drift: alive, but the current stop stays in view for a good while.
    const controls = g.controls()
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.15
    // Zoom for followers (pinch / scroll / two-finger). Globe radius is 100
    // world units → clamp between "city level" and "whole hemisphere".
    controls.enableZoom = true
    controls.minDistance = 130
    controls.maxDistance = 480
    // Pause the auto-drift while the viewer is exploring; resume after 10s.
    const onInteractStart = () => {
      controls.autoRotate = false
      if (idleTimer.current) clearTimeout(idleTimer.current)
    }
    const onInteractEnd = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(() => { controls.autoRotate = true }, 10_000)
    }
    controls.addEventListener('start', onInteractStart)
    controls.addEventListener('end', onInteractEnd)
    instRef.current = g
    const onResize = () => g.width(el.clientWidth).height(el.clientHeight)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      controls.removeEventListener('start', onInteractStart)
      controls.removeEventListener('end', onInteractEnd)
      if (idleTimer.current) clearTimeout(idleTimer.current)
      readyRef.current = false
      g._destructor()
      instRef.current = null
    }
    // build once — data updates flow through the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const g = instRef.current
    if (!g) return
    const stops = route.filter((s) => s.lat != null && s.lng != null)
    const cur = stops.find((s) => s.city === currentCity) ?? null
    const isPast = (s: SharedRouteStop) => s.depart <= todayISO
    const isCurrent = (s: SharedRouteStop) => s.city === currentCity
    g.pointsData(stops as object[])
      .pointLat((d) => (d as SharedRouteStop).lat as number)
      .pointLng((d) => (d as SharedRouteStop).lng as number)
      .pointColor((d) => {
        const s = d as SharedRouteStop
        return isCurrent(s) ? AMBER : isPast(s) ? TEAL : FUTURE
      })
      .pointAltitude(0.015)
      .pointRadius((d: object) => (isCurrent(d as SharedRouteStop) ? 0.65 : isPast(d as SharedRouteStop) ? 0.55 : 0.4))
      .pointLabel((d) => {
        const s = d as SharedRouteStop
        const when = isCurrent(s) ? ' · now' : isPast(s) ? ' · visited' : ' · upcoming'
        return `<div style="background:#171e26;border:1px solid #2a3642;border-radius:8px;padding:6px 9px;color:#e8edf2;font:12px -apple-system,sans-serif">${s.city}, ${s.country}<span style="color:#8fa3b8">${when}</span></div>`
      })
    // A leg is "travelled" once its destination stop has been reached.
    g.arcsData(
      stops.slice(1).map((s, i): Arc => ({
        startLat: stops[i].lat as number, startLng: stops[i].lng as number,
        endLat: s.lat as number, endLng: s.lng as number,
        past: s.arrive <= todayISO,
      })) as object[],
    )
      .arcColor((d: object) => ((d as Arc).past ? TEAL : FUTURE_ARC))
      .arcStroke((d: object) => ((d as Arc).past ? 0.42 : 0.3))
      .arcAltitudeAutoScale(0.35)
      .arcDashLength((d: object) => ((d as Arc).past ? 1 : 0.6))
      .arcDashGap((d: object) => ((d as Arc).past ? 0 : 0.25))
      .arcDashAnimateTime((d: object) => ((d as Arc).past ? 0 : 4000))
    const ringStop =
      (lastSeenCity ? stops.find((s) => s.city === lastSeenCity) : null) ?? cur
    g.ringsData(ringStop ? [ringStop] : [])
      .ringLat((d) => (d as SharedRouteStop).lat as number)
      .ringLng((d) => (d as SharedRouteStop).lng as number)
      .ringColor(() => (stale ? GREY : AMBER))
      .ringMaxRadius(4)
      .ringPropagationSpeed(stale ? 0.5 : 1.2)
      .ringRepeatPeriod(stale ? 3600 : 1400)
    const focus = ringStop ?? cur ?? stops[0]
    focusRef.current = focus
      ? { lat: (focus.lat as number) - 8, lng: focus.lng as number }
      : null
    applyFocus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, currentCity, todayISO, lastSeenCity, stale])

  return <div ref={boxRef} className="h-full w-full" aria-label="Trip route globe" />
}
