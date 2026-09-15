import type { Trip, LedgerEntry, TripState } from '@/lib/trips/types'

// A trip shaped like the owner's real one (September 2026), for the dev-only
// Money preview. Numbers are illustrative, not the production ledger.
const e = (id: string, date: string, category: string, amount: number, currency: string, note: string, extra: Partial<LedgerEntry> = {}): LedgerEntry =>
  ({ id, date, type: 'expense', category, amount, currency, note, ...extra })

export function fixtureTrip(today: string): Trip {
  const state: TripState = {
    meta: { version: 1, tripName: 'Asia', travelers: 2, baseCurrency: 'HUF', budgetCap: 4_500_000, startDate: '2026-08-31', endDate: '2027-04-30', homeBase: 'Budapest' },
    rates: { HUF: 1, THB: 10, USD: 340, VND: 0.013 },
    segments: [
      { id: 'bkk', country: 'Thailand', city: 'Bangkok', arrive: '2026-09-01', depart: '2026-09-30', tier: 1 },
      { id: 'han', country: 'Vietnam', city: 'Hanoi', arrive: '2026-09-30', depart: '2026-11-13', tier: 1 },
      { id: 'dad', country: 'Vietnam', city: 'Da Nang', arrive: '2026-11-13', depart: '2026-12-13', tier: 1 },
    ],
    stays: [
      { id: 'st1', segId: 'bkk', name: 'Bangkok - Home in Khet Huai Khwang', platform: 'Booking.com', cur: 'USD', ppn: 33.71, nights: 29, status: 'chosen', include: true, chargeDate: '2026-07-09' },
      // booked, but the card is not hit until the 29th: SCHEDULED, not spent
      { id: 'st2', segId: 'han', name: 'Văn Giang (Mai Kenny)', platform: 'Airbnb', cur: 'USD', ppn: 29, status: 'chosen', include: true, chargeDate: '2026-09-29' },
      // ticked into the plan while still a shortlist: a DRAFT. It forecasts
      // Da Nang, and must never show up as money paid or money to pay.
      { id: 'st3', segId: 'dad', name: 'An Bang beach house', platform: 'Airbnb', cur: 'USD', ppn: 41, status: 'shortlist', include: true },
    ],
    transport: [
      { id: 't1', type: 'flight', from: 'Budapest', to: 'Bangkok', date: '2026-08-31', cur: 'HUF', price: 248_000, status: 'booked', include: true },
      { id: 't2', type: 'flight', from: 'Bangkok', to: 'Hanoi', date: '2026-09-30', cur: 'USD', price: 0, status: 'idea', include: true },
    ],
    extras: [],
    notes: {},
    autoImport: true,
  }
  const ledger: LedgerEntry[] = [
    e('imp-st1', '2026-07-09', 'stays', 977.59, 'USD', 'Bangkok - Home in Khet Huai Khwang', { source: { kind: 'stay', id: 'st1' } }),
    e('g1', '2026-08-20', 'gear', 64_900, 'HUF', 'Osprey backpack'),
    e('g2', '2026-08-30', 'connectivity', 10.99, 'USD', 'Saily E-sim 10 GB'),
    e('imp-t1', '2026-08-31', 'transport', 248_000, 'HUF', 'flight Budapest → Bangkok', { source: { kind: 'transport', id: 't1' } }),
    e('a1', '2026-08-31', 'food', 35_100, 'HUF', 'Airport (food, drinks)'),
    e('s1', '2026-09-01', 'groceries', 5_943, 'HUF', 'Toilet paper (big pack), Big milk (2l), 2 big waters (5l), Trashbags (20), Kimchi, Toasts (2). Kimchi+ toast was dinner'),
    e('s1b', '2026-09-01', 'local-transport', 300, 'THB', 'Grab from the airport'),
    e('s2a', '2026-09-02', 'drinks', 170, 'THB', 'Iced coffees'),
    e('s2b', '2026-09-02', 'clothes', 200, 'THB', 'T-shirt'),
    e('s2c', '2026-09-02', 'clothes', 880, 'THB', 'Pants'),
    e('s2d', '2026-09-02', 'food', 1050, 'THB', 'Japanese restaurant'),
    e('s2e', '2026-09-02', 'food', 130, 'THB', '2 meals'),
    e('s2f', '2026-09-02', 'convenience', 635.5, 'THB', 'Snacks, tea, beer'),
    e('s2g', '2026-09-02', 'personal-care', 1284, 'THB', 'Watsons'),
    e('s3a', '2026-09-03', 'food', 320, 'THB', 'Breakfast meals'),
    e('s3b', '2026-09-03', 'personal-care', 1104, 'THB', 'Face care'),
    e('s3c', '2026-09-03', 'food', 300, 'THB', '4 big meals'),
    e('s3d', '2026-09-03', 'clothes', 120, 'THB', 'Elephant pants'),
    e('s3e', '2026-09-03', 'accessories', 239, 'THB', 'Phone strap'),
    e('s4a', '2026-09-04', 'souvenirs', 20, 'THB', 'Postcard from the grand palace'),
    e('s4b', '2026-09-04', 'local-transport', 200, 'THB', 'Tuk-tuk'),
    e('s4c', '2026-09-04', 'activities', 600, 'THB', 'Reclining Buddha'),
    e('s4d', '2026-09-04', 'food', 160, 'THB', '4 pieces of bao'),
    e('s4e', '2026-09-04', 'fees', 220, 'THB', 'ATM fee'),
    e('s5a', '2026-09-05', 'drinks', 160, 'THB', 'Thai tea, juices'),
    e('s5b', '2026-09-05', 'health', 500, 'THB', 'Massage'),
    e('s5c', '2026-09-05', 'clothes', 380, 'THB', 'Pants, scarf'),
    e('s5d', '2026-09-05', 'food', 440, 'THB', '4 meals, mango sticky rice'),
    e('s5e', '2026-09-05', 'accessories', 200, 'THB', 'Sunglasses'),
    e('s7a', '2026-09-07', 'food', 520, 'THB', 'Street food night'),
    e('s7b', '2026-09-07', 'local-transport', 90, 'THB', 'BTS'),
    e('s9a', '2026-09-09', 'health', 500, 'THB', 'Massage'),
    e('s9b', '2026-09-09', 'food', 320, 'THB', '4 meals'),
    e('s10a', '2026-09-10', 'food', 160, 'THB', 'Bao (4)'),
    e('s10b', '2026-09-10', 'local-transport', 170, 'THB', 'Tuk-tuk to the palace'),
    e('s11a', '2026-09-11', 'drinks', 170, 'THB', 'Iced coffees'),
    e('s12a', '2026-09-12', 'food', 410, 'THB', 'Dinner by the river'),
    e('s13a', today, 'convenience', 95, 'THB', '7-Eleven breakfast'),
    // dated ahead of `today` — the ledger shows it, the overview does not count it
    e('imp-st2', '2026-09-29', 'stays', 1276, 'USD', 'Văn Giang (Mai Kenny)', { source: { kind: 'stay', id: 'st2' } }),
    { id: 'inc1', date: '2026-09-01', type: 'income', category: 'freelance', amount: 420_000, currency: 'HUF', note: 'August invoice' },
  ]
  return {
    id: 'fixture', owner: 'dev', name: 'Asia', state, ledger,
    updated_at: new Date().toISOString(), created_at: new Date().toISOString(), state_rev: 0, ledger_rev: 0,
  }
}
