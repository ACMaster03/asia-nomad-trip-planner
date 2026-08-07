import { CloudRain, TriangleAlert } from 'lucide-react'
import { MapModal } from './MapModal'
import type { Hazard } from '@/lib/map/globeData'
import { monthName, quakeSafetyNote } from '@/lib/map/globeData'

// Restyled per the LIVHOLD map chrome (frame 19): dark surface, 16px floor,
// Lucide icons, amber for hazards (no red in the palette), mauve links.
const sub = 'text-base text-[rgba(216,224,229,.65)]'

export function HazardPanel({ d, onClose }: { d: Hazard; onClose: () => void }) {
  const closeBtn = (
    <div className="mt-4">
      <button
        className="rounded-full border border-[rgba(216,224,229,.24)] px-4 py-2 text-base font-medium"
        onClick={onClose}
      >
        Close
      </button>
    </div>
  )
  if (d.kind === 'quake') {
    const when = d.time ? new Date(d.time).toLocaleString() : 'recently'
    return (
      <MapModal
        title={
          <span className="flex items-center gap-2">
            <TriangleAlert aria-hidden className="size-5 flex-none text-[#D9A85C]" strokeWidth={2} />
            Magnitude {d.mag?.toFixed(1) ?? '?'} earthquake
          </span>
        }
        label={`Magnitude ${d.mag?.toFixed(1) ?? '?'} earthquake`}
        onClose={onClose}
      >
        <div className={sub}>{d.place}</div>
        <p className="my-2 text-base">When: {when}</p>
        <p className="text-base">{quakeSafetyNote(d.mag ?? 0)}</p>
        {d.url && (
          <p className="mt-2">
            <a href={d.url} target="_blank" rel="noopener" className="font-medium text-[#D08795] underline">
              Full USGS report ↗
            </a>
          </p>
        )}
        <p className={'mt-2.5 ' + sub}>Live feed: M4.5+ quakes, past 7 days (USGS). Recent seismic activity, not a forecast.</p>
        {closeBtn}
      </MapModal>
    )
  }
  return (
    <MapModal
      title={
        <span className="flex items-center gap-2">
          <CloudRain aria-hidden className="size-5 flex-none text-[#D9A85C]" strokeWidth={2} />
          Heavy-rain / monsoon season
        </span>
      }
      label="Heavy-rain / monsoon season"
      onClose={onClose}
    >
      <div className={sub}>{d.city} — {monthName()}</div>
      <p className="my-2 text-base">~<b>{d.rain} mm</b> of rain expected this month — well into the wet season.</p>
      {d.hazardText && <p className="text-base">{d.hazardText}</p>}
      <p className={'mt-2.5 ' + sub}>From your city climate data — expect frequent downpours and possible flooding/transport disruption; check live forecasts close to your dates.</p>
      {closeBtn}
    </MapModal>
  )
}
