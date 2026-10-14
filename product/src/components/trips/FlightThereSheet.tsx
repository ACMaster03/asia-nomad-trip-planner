'use client'
import { useState } from 'react'
import { Sheet } from '@/app/(app)/live/Sheet'
import { hint, input, label, primaryBtn } from './sheetKit'

// "Or start with the flight there" (the phone's FlightThereSheet): the
// transport form needs both ends of a leg, and with no stops there is no leg
// yet. Ask where it goes first, then the usual transport form opens; once the
// flight is saved, the stop form opens for that place, so the flight joins the
// home → first stop leg straight away.
export function FlightThereSheet({ home, onNext, onClose }: { home: string; onNext: (from: string, to: string) => void; onClose: () => void }) {
  const [from, setFrom] = useState(home)
  const [to, setTo] = useState('')
  const ok = !!from.trim() && !!to.trim()
  return (
    <Sheet label="The flight there" onClose={onClose}>
      <h3 className="text-[22px] font-semibold">The flight there</h3>
      <label className={label}>
        From
        <input className={input} value={from} placeholder="City" autoComplete="off" onChange={(e) => setFrom(e.target.value)} />
      </label>
      <label className={label}>
        To
        <input className={input} value={to} placeholder="City" autoComplete="off" onChange={(e) => setTo(e.target.value)} />
      </label>
      <p className={hint}>Where the journey starts, and the first place you’re going. After the flight, you add that place as your first stop.</p>
      <button type="button" disabled={!ok} onClick={() => onNext(from.trim(), to.trim())} className={primaryBtn + ' disabled:opacity-40'}>
        Next
      </button>
    </Sheet>
  )
}
