import { Modal } from '@/components/trips/Modal'
import type { City, Country } from '@/lib/catalogue/types'
import type { Segment } from '@/lib/trips/types'
import { fmtHUF } from '@/lib/trips/format'
import { COUNTRY_ALIAS, isoToFlag } from '@/lib/map/globeData'

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
  const neName = feat.properties?.name ?? ''
  const neIso = feat.properties?.iso ?? ''
  const name = COUNTRY_ALIAS[neName] ?? neName
  const co = countries.find((c) => c.name === name)
  const flag = isoToFlag(co?.iso2 ?? neIso)
  const routeCities = new Set(segments.filter((s) => s.include !== false).map((s) => s.city))
  const list = cities
    .filter((c) => c.country === name)
    .sort((a, b) => (a.daily_living_mid ?? 1e9) - (b.daily_living_mid ?? 1e9))

  return (
    <Modal title={`${flag} ${name || neName || 'Unknown'}`} onClose={onClose}>
      {co?.currency && (
        <div className="text-sm text-neutral-400">
          Currency: <b>{co.currency}</b>
          {rates[co.currency] ? ` · 1 ${co.currency} ≈ ${fmtHUF(rates[co.currency])}` : ''}
        </div>
      )}
      {co?.visa && <p className="my-2 text-sm"><b>Visa:</b> {co.visa}</p>}
      {co?.best_time && <p className="text-xs"><b>Best time:</b> {co.best_time}</p>}
      {co?.safety && <p className="text-xs"><b>Safety:</b> {co.safety}</p>}
      {list.length ? (
        <>
          <h4 className="mb-1 mt-3 font-semibold">Cities — cheapest to priciest (daily living, 2 ppl)</h4>
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-neutral-400"><th>City</th><th>Daily</th><th>Stay (mid)</th><th>Rent/mo</th></tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td>{routeCities.has(c.city) ? '📍 ' : ''}{c.city}</td>
                    <td>~${c.daily_living_mid ?? '?'}</td>
                    <td>~${c.accom_mid ?? '?'}</td>
                    <td>{c.rent_monthly ? `~$${c.rent_monthly}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">📍 = a stop on your trip</p>
        </>
      ) : (
        <p className="mt-2 text-neutral-500">No cities tracked here yet{co ? '' : " (and this isn't in your trip data)"}.</p>
      )}
      <div className="mt-3">
        <button className="rounded border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-700" onClick={onClose}>Close</button>
      </div>
    </Modal>
  )
}
