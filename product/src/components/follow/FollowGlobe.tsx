'use client'
import { useEffect, useRef } from 'react'
import Globe from 'globe.gl'
import type { SharedRouteStop } from '@/lib/follow/api'

// The follower page's globe — deliberately NOT a wrapper around the planner's
// Globe.tsx (that one is coupled to catalogue costs, hazards and the app
// router). This renders only what the sanitized summary RPC returns: route
// points, arcs between consecutive stops, and a pulsing ring on the current
// stop. Phone-first: small, auto-rotating, drag-to-spin.

type Inst = InstanceType<typeof Globe>

interface Props {
  route: SharedRouteStop[]
  currentCity: string | null
}

const TEAL = '#0d9488'
const AMBER = '#f0a83c'

export default function FollowGlobe({ route, currentCity }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const instRef = useRef<Inst | null>(null)
  const readyRef = useRef(false)
  const focusRef = useRef<{ lat: number; lng: number } | null>(null)

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
    g.controls().autoRotate = true
    g.controls().autoRotateSpeed = 0.15
    g.controls().enableZoom = false
    instRef.current = g
    const onResize = () => g.width(el.clientWidth).height(el.clientHeight)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
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
    g.pointsData(stops as object[])
      .pointLat((d) => (d as SharedRouteStop).lat as number)
      .pointLng((d) => (d as SharedRouteStop).lng as number)
      .pointColor((d) => ((d as SharedRouteStop).city === currentCity ? AMBER : TEAL))
      .pointAltitude(0.015)
      .pointRadius(0.55)
      .pointLabel((d) => {
        const s = d as SharedRouteStop
        return `<div style="background:#171e26;border:1px solid #2a3642;border-radius:8px;padding:6px 9px;color:#e8edf2;font:12px -apple-system,sans-serif">${s.city}, ${s.country}</div>`
      })
    g.arcsData(
      stops.slice(1).map((s, i) => ({
        startLat: stops[i].lat, startLng: stops[i].lng, endLat: s.lat, endLng: s.lng,
      })) as object[],
    )
      .arcColor(() => TEAL)
      .arcStroke(0.35)
      .arcAltitudeAutoScale(0.35)
      .arcDashLength(0.6)
      .arcDashGap(0.25)
      .arcDashAnimateTime(4000)
    g.ringsData(cur ? [cur] : [])
      .ringLat((d) => (d as SharedRouteStop).lat as number)
      .ringLng((d) => (d as SharedRouteStop).lng as number)
      .ringColor(() => AMBER)
      .ringMaxRadius(4)
      .ringPropagationSpeed(1.2)
      .ringRepeatPeriod(1400)
    const focus = cur ?? stops[0]
    focusRef.current = focus
      ? { lat: (focus.lat as number) - 8, lng: focus.lng as number }
      : null
    applyFocus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, currentCity])

  return <div ref={boxRef} className="h-full w-full" aria-label="Trip route globe" />
}
