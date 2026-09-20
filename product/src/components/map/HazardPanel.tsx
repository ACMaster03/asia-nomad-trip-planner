import { CloudRain, TriangleAlert, Zap } from 'lucide-react'
import { MapModal } from './MapModal'
import type { Hazard } from '@/lib/map/globeData'
import { monthName, quakeSafetyNote } from '@/lib/map/globeData'
import { timeAgo } from '@/lib/trips/format'

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
      <div className={sub}>{d.city}, {monthName()}</div>
      <p className="my-2 text-base">~<b>{d.rain} mm</b> of rain expected this month, well into the wet season.</p>
      {d.hazardText && <p className="text-base">{d.hazardText}</p>}
      <p className={'mt-2.5 ' + sub}>From your city climate data: expect frequent downpours and possible flooding/transport disruption; check live forecasts close to your dates.</p>
      {closeBtn}
    </MapModal>
  )
}

/**
 * What the Hazards layer counts, and how old the numbers are.
 *
 * The count chip used to read "3 hazards" and stop there, which invites the
 * reading it least deserves: a safety score for the country you are looking
 * at. It is two unrelated feeds on one amber colour, one of them live and one
 * of them a seasonal average, and neither is a forecast or an advisory. Say
 * that where the number is, because that is where the question is asked.
 */
export function HazardSourcesPanel({
  quakeCount,
  updatedAt,
  failed,
  onClose,
}: {
  quakeCount: number | null
  /** React Query's dataUpdatedAt for the USGS feed; 0 before the first fetch */
  updatedAt: number
  failed: boolean
  onClose: () => void
}) {
  return (
    <MapModal
      title={
        <span className="flex items-center gap-2">
          <Zap aria-hidden className="size-5 flex-none text-[#D9A85C]" strokeWidth={2} />
          What Hazards shows
        </span>
      }
      label="What Hazards shows"
      onClose={onClose}
    >
      <p className="text-base">Two separate things share the amber marks, and they are not the same kind of fact.</p>

      <p className="mt-3 flex items-center gap-2 text-base font-semibold">
        <TriangleAlert aria-hidden className="size-4 flex-none text-[#D9A85C]" strokeWidth={2} />
        Earthquakes, live
      </p>
      <p className={'mt-1 ' + sub}>
        Magnitude 4.5 and above anywhere in the world, over the last seven days, from the USGS
        public feed. Only 5.5 and above gets a ring.{' '}
        {failed
          ? 'The last check failed, so what you see may be older than it looks.'
          : updatedAt
            ? `Checked ${timeAgo(new Date(updatedAt).toISOString())}, and again every 15 minutes while this screen is open.`
            : 'Not fetched yet.'}
        {quakeCount != null && ` ${quakeCount} in the feed right now.`}
      </p>

      <p className="mt-3 flex items-center gap-2 text-base font-semibold">
        <CloudRain aria-hidden className="size-4 flex-none text-[#D9A85C]" strokeWidth={2} />
        Heavy rain, seasonal
      </p>
      <p className={'mt-1 ' + sub}>
        Cities on your route whose climate data expects 400mm or more of rain in {monthName()}.
        This is a long-run average for the month, not a weather forecast, and it does not change
        from day to day.
      </p>

      <p className={'mt-3 ' + sub}>
        Neither is a travel advisory or a safety rating for a country. An amber mark means
        something measurable happened nearby or is normal for the season, nothing more. Check a
        live forecast and your government’s advice close to your dates.
      </p>

      <div className="mt-4">
        <button
          className="rounded-full border border-[rgba(216,224,229,.24)] px-4 py-2 text-base font-medium"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </MapModal>
  )
}
