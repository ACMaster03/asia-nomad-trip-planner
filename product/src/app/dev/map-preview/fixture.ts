import type { City, Country } from '@/lib/catalogue/types'
import type { FollowedPerson, FollowedSummary } from '@/lib/follow/follows'
import type { SharedRouteStop } from '@/lib/follow/api'

// Catalogue rows for the dev-only Map preview: enough cities to draw the
// fixture trip (money-preview/fixture.ts: Budapest → Bangkok → Hanoi → Da Nang)
// plus a few off-route ones, with the attribute paths the globe reads
// (costs.*, internet, landmarks, weather.months[].rain, weather.hazard).
const months = (rain: number[]) => rain.map((r) => ({ rain: r }))
const costs = (budget: number, mid: number, nice: number, low: number, midL: number, high: number) => ({
  accomPerNight: { budget, mid, nice },
  dailyLiving: { low, mid: midL, high },
})

let n = 0
const city = (
  country: string, name: string, region: string, lat: number, lng: number,
  attrs: Record<string, unknown>, rent: number | null = null,
): City => ({
  id: ++n, country, city: name, region, region_name: region, lat, lng,
  daily_living_mid: (attrs.costs as { dailyLiving: { mid: number } } | undefined)?.dailyLiving.mid ?? null,
  accom_mid: (attrs.costs as { accomPerNight: { mid: number } } | undefined)?.accomPerNight.mid ?? null,
  rent_monthly: rent, attributes: attrs,
})

export const cities: City[] = [
  city('Thailand', 'Bangkok', 'sea', 13.7563, 100.5018, {
    costs: costs(18, 34, 70, 30, 45, 80), internet: 'Fast (100+ Mbps)',
    landmarks: ['Wat Pho', 'Grand Palace', 'Chatuchak'],
    weather: { hazard: 'Wet season Jun–Oct; flooding possible', months: months([15, 20, 40, 80, 190, 160, 160, 190, 320, 240, 50, 10]) },
  }, 650),
  city('Thailand', 'Chiang Mai', 'sea', 18.7883, 98.9853, {
    costs: costs(12, 26, 55, 22, 35, 60), internet: 'Fast (100+ Mbps)',
    landmarks: ['Doi Suthep', 'Old City'],
    weather: { hazard: 'Burning season Feb–Apr (smoke)', months: months([5, 10, 15, 50, 150, 130, 160, 220, 250, 120, 40, 15]) },
  }, 450),
  city('Vietnam', 'Hanoi', 'sea', 21.0285, 105.8542, {
    costs: costs(14, 29, 60, 25, 38, 65), internet: 'Good (50–100 Mbps)',
    landmarks: ['Old Quarter', 'Hoan Kiem Lake'],
    weather: { hazard: 'Typhoon season Jul–Oct', months: months([20, 25, 45, 90, 190, 240, 290, 310, 260, 130, 60, 20]) },
  }, 500),
  city('Vietnam', 'Da Nang', 'sea', 16.0544, 108.2022, {
    costs: costs(15, 32, 65, 24, 36, 62), internet: 'Good (50–100 Mbps)',
    landmarks: ['My Khe beach', 'Marble Mountains'],
    weather: { hazard: 'Rainy season Sep–Dec; typhoons Oct–Nov', months: months([90, 30, 25, 30, 60, 90, 90, 120, 300, 620, 430, 200]) },
  }, 480),
  city('Vietnam', 'Hoi An', 'sea', 15.8801, 108.338, {
    costs: costs(13, 30, 62, 22, 34, 58), internet: 'Good (50–100 Mbps)',
    landmarks: ['Ancient Town', 'An Bang beach'],
    weather: { hazard: 'Floods Oct–Nov', months: months([90, 30, 25, 30, 60, 90, 90, 120, 300, 620, 430, 200]) },
  }, 420),
  city('Japan', 'Kyoto', 'ea', 35.0116, 135.7681, {
    costs: costs(35, 70, 140, 45, 70, 120), internet: 'Fast (100+ Mbps)',
    landmarks: ['Fushimi Inari', 'Arashiyama'],
    weather: { hazard: 'Typhoons Aug–Oct', months: months([50, 65, 110, 130, 150, 220, 230, 140, 180, 120, 70, 45]) },
  }, 900),
  city('Japan', 'Tokyo', 'ea', 35.6762, 139.6503, {
    costs: costs(40, 85, 160, 50, 80, 140), internet: 'Fast (100+ Mbps)',
    landmarks: ['Shibuya', 'Senso-ji'],
    weather: { hazard: 'Typhoons Aug–Oct', months: months([50, 55, 115, 130, 140, 170, 155, 170, 210, 200, 95, 55]) },
  }, 1100),
  city('Indonesia', 'Canggu', 'sea', -8.6478, 115.1385, {
    costs: costs(15, 35, 80, 25, 40, 70), internet: 'Good (50–100 Mbps)',
    landmarks: ['Echo Beach', 'Tanah Lot'],
    weather: { hazard: 'Wet season Nov–Mar', months: months([340, 270, 200, 90, 70, 60, 40, 25, 50, 90, 150, 280]) },
  }, 700),
  city('Portugal', 'Lisbon', 'eu', 38.7223, -9.1393, {
    costs: costs(40, 80, 150, 40, 65, 110), internet: 'Fast (100+ Mbps)',
    landmarks: ['Alfama', 'Belém'],
    weather: { hazard: '', months: months([100, 90, 55, 65, 55, 20, 5, 5, 30, 100, 110, 110]) },
  }, 1300),
]

export const countries: Country[] = [
  { code: 'TH', name: 'Thailand', iso2: 'TH', currency: 'THB', visa: '60 days visa-free', best_time: 'Nov–Feb', safety: 'Generally safe', extras: {} },
  { code: 'VN', name: 'Vietnam', iso2: 'VN', currency: 'VND', visa: 'e-visa 90 days', best_time: 'Oct–Apr', safety: 'Generally safe', extras: {} },
  { code: 'JP', name: 'Japan', iso2: 'JP', currency: 'JPY', visa: '90 days visa-free', best_time: 'Mar–May, Oct–Nov', safety: 'Very safe', extras: {} },
  { code: 'ID', name: 'Indonesia', iso2: 'ID', currency: 'IDR', visa: 'VoA 30 days', best_time: 'Apr–Oct', safety: 'Generally safe', extras: {} },
  { code: 'PT', name: 'Portugal', iso2: 'PT', currency: 'EUR', visa: 'Schengen', best_time: 'Apr–Oct', safety: 'Very safe', extras: {} },
]

// Issue #9: people you follow, with itineraries that touch the fixture trip
// (Hanoi 30 Sep – 13 Nov, Da Nang 13 Nov – 13 Dec). Anna and Tom share a trip
// and are both in Hanoi — two heads make the mark thicken.
export const TRIP_A = 'trip-anna-tom'
export const TRIP_E = 'trip-eva'
export const TRIP_M = 'trip-mari'
export const TRIP_B = 'trip-bangkok-five'
export const TRIP_C = 'trip-chiang-mai-four'
// three solo trips in Bangkok now: Home's queue holds three lines, the fourth waits
export const SOLO = ['Kim', 'Lou', 'Noa'] as const
export const soloTrip = (name: string) => `trip-solo-${name.toLowerCase()}`
const at = (name: string): { lat: number; lng: number } => { const c = cities.find((x) => x.city === name)!; return { lat: c.lat!, lng: c.lng! } }
const stop = (city: string, country: string, arrive: string, depart: string, pos = at(city)): SharedRouteStop => ({ city, country, arrive, depart, ...pos })
const routeA = [
  stop('Bangkok', 'Thailand', '2026-09-05', '2026-09-16'),
  stop('Hanoi', 'Vietnam', '2026-09-16', '2026-10-05'),
  stop('Hoi An', 'Vietnam', '2026-10-05', '2026-10-20'),
  stop('Da Nang', 'Vietnam', '2026-10-20', '2026-11-20'),
]
const routeE = [stop('Kyoto', 'Japan', '2026-09-10', '2026-09-28'), stop('Tokyo', 'Japan', '2026-09-28', '2026-10-10')]
const routeM = [stop('Lisbon', 'Portugal', '2026-09-10', '2026-12-01')]
const routeB = [stop('Bangkok', 'Thailand', '2026-09-10', '2026-10-10')]
const routeC = [stop('Chiang Mai', 'Thailand', '2026-09-10', '2026-10-10')]
const routeS = [stop('Bangkok', 'Thailand', '2026-09-15', '2026-09-25'), stop('Chiang Mai', 'Thailand', '2026-09-25', '2026-10-08')]
const card = (trip_id: string, tripName: string, travellers: Array<[string, string]>, currentCity: string, currentCountry: string) => ({
  trip_id, tripName, startDate: '2026-09-05', endDate: null, state: 'on' as const,
  travellers: travellers.map(([id, name]) => ({ id, name })), currentCity, currentCountry, lastEventAt: null, lastSeenCity: currentCity,
})
export const following: FollowedPerson[] = [
  { user_id: 'anna', name: 'Anna', followedAt: '2026-08-01', trips: [card(TRIP_A, 'Vietnam, slowly', [['anna', 'Anna'], ['tom', 'Tom']], 'Hanoi', 'Vietnam')] },
  { user_id: 'tom', name: 'Tom', followedAt: '2026-08-01', trips: [card(TRIP_A, 'Vietnam, slowly', [['anna', 'Anna'], ['tom', 'Tom']], 'Hanoi', 'Vietnam')] },
  { user_id: 'eva', name: 'Eva', followedAt: '2026-08-10', trips: [card(TRIP_E, 'Japan in autumn', [['eva', 'Eva']], 'Kyoto', 'Japan')] },
  // four on one Chiang Mai trip: three glyphs and a plus
  ...['Gus', 'Hal', 'Ida', 'Jo'].map((name) => ({
    user_id: name.toLowerCase(), name, followedAt: '2026-08-20',
    trips: [card(TRIP_C, 'Chiang Mai month', [['gus', 'Gus'], ['hal', 'Hal'], ['ida', 'Ida'], ['jo', 'Jo']], 'Chiang Mai', 'Thailand')],
  })),
  { user_id: 'mari', name: 'Mari', followedAt: '2026-07-01', trips: [card(TRIP_M, 'Lisbon weeks', [['mari', 'Mari']], 'Lisbon', 'Portugal')] },
  { user_id: 'dani', name: 'Dani', followedAt: '2026-06-01', trips: [] },
  ...SOLO.map((name) => ({
    user_id: name.toLowerCase(), name, followedAt: '2026-09-01',
    trips: [card(soloTrip(name), `${name} in Thailand`, [[name.toLowerCase(), name]], 'Bangkok', 'Thailand')],
  })),
  // five on one Bangkok trip: the mark stops growing here and gains a plus
  ...['Bea', 'Cas', 'Dov', 'Eli', 'Fin'].map((name) => ({
    user_id: name.toLowerCase(), name, followedAt: '2026-08-20',
    trips: [card(TRIP_B, 'Bangkok month', [['bea', 'Bea'], ['cas', 'Cas'], ['dov', 'Dov'], ['eli', 'Eli'], ['fin', 'Fin']], 'Bangkok', 'Thailand')],
  })),
]
const summary = (tripName: string, route: SharedRouteStop[], travellers: Array<[string, string]>): FollowedSummary => ({
  tripName, startDate: route[0].arrive, endDate: route[route.length - 1].depart, route,
  travellers: travellers.map(([id, name]) => ({ id, name })), following: travellers.map(([id]) => id),
})
export const summaries: Record<string, FollowedSummary> = {
  [TRIP_A]: summary('Vietnam, slowly', routeA, [['anna', 'Anna'], ['tom', 'Tom']]),
  [TRIP_E]: summary('Japan in autumn', routeE, [['eva', 'Eva']]),
  [TRIP_M]: summary('Lisbon weeks', routeM, [['mari', 'Mari']]),
  [TRIP_B]: summary('Bangkok month', routeB, [['bea', 'Bea'], ['cas', 'Cas'], ['dov', 'Dov'], ['eli', 'Eli'], ['fin', 'Fin']]),
  [TRIP_C]: summary('Chiang Mai month', routeC, [['gus', 'Gus'], ['hal', 'Hal'], ['ida', 'Ida'], ['jo', 'Jo']]),
  ...Object.fromEntries(SOLO.map((name) => [soloTrip(name), summary(`${name} in Thailand`, routeS, [[name.toLowerCase(), name]])])),
}
