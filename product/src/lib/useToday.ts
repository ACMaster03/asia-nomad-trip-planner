'use client'
import { useSyncExternalStore } from 'react'

// Today's ISO date, hydration-safe: '' on the server and on the first client
// render (so the markup matches), the real date right after. Same UTC-calendar
// convention as the (app) layout and Home.
const subscribeNever = () => () => {}
const today = () => new Date().toISOString().slice(0, 10)
const empty = () => ''
export function useToday(): string {
  return useSyncExternalStore(subscribeNever, today, empty)
}
