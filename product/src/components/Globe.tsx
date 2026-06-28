'use client'
import { useEffect, useRef } from 'react'
import Globe from 'globe.gl'
import type { City } from '@/lib/catalogue/types'

// Phase-0 globe: plots every catalogue city. The full port of js/map.js (route
// arcs, booked-flight styling, hazards, day/night, borders, numbered stops) layers
// on here once the per-user trip query is wired — it takes private trip data as a
// separate prop, not from the shared catalogue.
export default function GlobeView({ cities }: { cities: City[] }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const instRef = useRef<InstanceType<typeof Globe> | null>(null)

  useEffect(() => {
    const box = boxRef.current
    if (!box) return

    const points = cities
      .filter((c) => c.lat != null && c.lng != null)
      .map((c) => ({ lat: c.lat as number, lng: c.lng as number, city: c.city, country: c.country }))

    const g = new Globe(box)
      .globeImageUrl('/vendor/earth-night.jpg')
      .backgroundColor('rgba(0,0,0,0)')
      .showAtmosphere(true)
      .atmosphereColor('#37b3a4')
      .atmosphereAltitude(0.16)
      .pointsData(points)
      .pointLat('lat')
      .pointLng('lng')
      .pointColor(() => '#37b3a4')
      .pointAltitude(() => 0.01)
      .pointRadius(() => 0.4)
      .pointLabel((d: object) => {
        const p = d as { city: string; country: string }
        return `<div style="background:#171e26;border:1px solid #2a3642;border-radius:8px;padding:5px 8px;color:#e8edf2;font:12px sans-serif"><b>${p.city}</b><br>${p.country}</div>`
      })

    g.pointOfView({ lat: 24, lng: 100, altitude: 2.2 }, 0)
    const controls = g.controls() as { autoRotate: boolean; autoRotateSpeed: number }
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.6
    instRef.current = g

    const onResize = () => {
      g.width(box.clientWidth)
      g.height(box.clientHeight)
    }
    onResize()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      const inst = instRef.current as unknown as { _destructor?: () => void }
      inst?._destructor?.()
      instRef.current = null
    }
  }, [cities])

  return <div ref={boxRef} className="absolute inset-0" />
}
