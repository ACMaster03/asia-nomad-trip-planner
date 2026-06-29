import { Modal } from '@/components/trips/Modal'
import type { Hazard } from '@/lib/map/globeData'
import { monthName, quakeSafetyNote } from '@/lib/map/globeData'

export function HazardPanel({ d, onClose }: { d: Hazard; onClose: () => void }) {
  if (d.kind === 'quake') {
    const when = d.time ? new Date(d.time).toLocaleString() : 'recently'
    return (
      <Modal title={`🔴 Magnitude ${d.mag?.toFixed(1) ?? '?'} earthquake`} onClose={onClose}>
        <div className="text-sm text-neutral-400">{d.place}</div>
        <p className="my-2 text-sm">When: {when}</p>
        <p className="text-sm">{quakeSafetyNote(d.mag ?? 0)}</p>
        {d.url && (
          <p className="mt-2"><a href={d.url} target="_blank" rel="noopener" className="text-[#37b3a4] underline">Full USGS report ↗</a></p>
        )}
        <p className="mt-2 text-[11px] text-neutral-500">Live feed: M4.5+ quakes, past 7 days (USGS). Recent seismic activity, not a forecast.</p>
        <div className="mt-3"><button className="rounded border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-700" onClick={onClose}>Close</button></div>
      </Modal>
    )
  }
  return (
    <Modal title="🟠 Heavy-rain / monsoon season" onClose={onClose}>
      <div className="text-sm text-neutral-400">{d.city} — {monthName()}</div>
      <p className="my-2 text-sm">~<b>{d.rain} mm</b> of rain expected this month — well into the wet season.</p>
      {d.hazardText && <p className="text-sm">{d.hazardText}</p>}
      <p className="mt-2 text-[11px] text-neutral-500">From your city climate data — expect frequent downpours and possible flooding/transport disruption; check live forecasts close to your dates.</p>
      <div className="mt-3"><button className="rounded border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-700" onClick={onClose}>Close</button></div>
    </Modal>
  )
}
