import { MapPin } from 'lucide-react'
import { MapModal } from './MapModal'
import { useMoney } from '@/lib/trips/Money'
import type { City, Country } from '@/lib/catalogue/types'
import type { Segment } from '@/lib/trips/types'

import { COUNTRY_ALIAS, isoToFlag } from '@/lib/map/globeData'

// Restyled per the LIVHOLD map chrome (frame 19): dark surface, 16px floor,
// Lucide route markers (country flags stay emoji), mauve accents.
const sub = 'text-[rgba(216,224,229,.65)]'

export function CountryPanel({
  feat, countries, cities, segments, rates, onClose,
}: {
  feat: { properties?: { name?: string; iso?: string } }
  countries: Country[]
  cities: City[]
  segments: Segment[]
  rates: Record<string, number>
  onClose: () => void
}) {
  const { fmt } = useMoney()
  const neName = feat.properties?.name ?? ''
  const neIso = feat.properties?.iso ?? ''
  const name = COUNTRY_ALIAS[neName] ?? neName
  const co = countries.find((c) => c.name === name)
  const flag = isoToFlag(co?.iso2 ?? neIso)
  const routeCities = new Set(segments.filter((s) => s.include !== false).map((s) => s.city))
  const list = cities
    .filter((c) => c.country === name)
    .sort((a, b) => (a.daily_living_mid ?? 1e9) - (b.daily_living_mid ?? 1e9))

  const routePin = (
    <MapPin aria-hidden className="mr-1 inline size-4 align-[-2.5px] text-[#D08795]" strokeWidth={2} />
  )
  return (
    <MapModal title={`${flag} ${name || neName || 'Unknown'}`} onClose={onClose}>
      {co?.currency && (
        <div className={'text-base ' + sub}>
          Currency: <b className="text-[#d8e0e5]">{co.currency}</b>
          {rates[co.currency] ? ` · 1 ${co.currency} ≈ ${fmt(rates[co.currency])}` : ''}
        </div>
      )}
      {co?.visa && <p className="my-2 text-base"><b>Visa:</b> {co.visa}</p>}
      {co?.best_time && <p className="text-base"><b>Best time:</b> {co.best_time}</p>}
      {co?.safety && <p className="mt-1 text-base"><b>Safety:</b> {co.safety}</p>}
      {list.length ? (
        <>
          <h4 className="mb-1.5 mt-3.5 text-base font-semibold">Cities — cheapest to priciest (daily living, 2 ppl)</h4>
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-left text-base">
              <thead>
                <tr className={sub}><th className="font-medium">City</th><th className="font-medium">Daily</th><th className="font-medium">Stay (mid)</th><th className="font-medium">Rent/mo</th></tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} className="border-t border-[rgba(216,224,229,.1)]">
                    <td className="py-1.5">{routeCities.has(c.city) && routePin}{c.city}</td>
                    <td>~${c.daily_living_mid ?? '?'}</td>
                    <td>~${c.accom_mid ?? '?'}</td>
                    <td>{c.rent_monthly ? `~$${c.rent_monthly}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={'mt-2 text-base ' + sub}>{routePin}= a stop on your trip</p>
        </>
      ) : (
        <p className={'mt-2 text-base ' + sub}>No cities tracked here yet{co ? '' : " (and this isn't in your trip data)"}.</p>
      )}
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
