import type { City, Country } from '@/lib/catalogue/types'

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
