export type CurrencyCode = string

export interface TripMeta {
  version: number
  tripName: string
  travelers: number
  baseCurrency: CurrencyCode
  budgetCap: number
  startDate: string
}
export type Tier = 0 | 1 | 2

export interface Segment {
  id: string
  country: string
  city: string
  arrive: string
  depart: string
  nights?: number | null
  tier?: Tier | null
  color?: string
  include?: boolean
  notes?: string
  weather?: string
}
export interface Stay {
  id: string
  segId: string
  name: string
  platform?: string
  url?: string
  cur: CurrencyCode
  ppn: number
  nights?: number | null
  rating?: number
  status?: string
  include?: boolean
  notes?: string
}
export interface TransportLeg {
  id: string
  type: string
  from: string
  to: string
  date?: string
  provider?: string
  url?: string
  cur: CurrencyCode
  price: number
  status?: string
  include?: boolean
  notes?: string
}
export interface Extra {
  id: string
  label: string
  cur: CurrencyCode
  amount: number
  category?: string
  include?: boolean
}
export interface TripState {
  meta: TripMeta
  rates: Record<CurrencyCode, number> // Ft per 1 unit; rates.HUF === 1
  segments: Segment[]
  stays: Stay[]
  transport: TransportLeg[]
  extras: Extra[]
  notes: Record<string, string>
}
export interface LedgerEntry {
  id: string
  date: string
  type: 'income' | 'expense'
  category: string
  amount: number
  currency: CurrencyCode
  note: string
}
export type Ledger = LedgerEntry[]

export interface Trip {
  id: string
  owner: string
  name: string
  state: TripState
  ledger: Ledger
  updated_at: string
  created_at: string
}
