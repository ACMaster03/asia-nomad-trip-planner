'use client'
import { useState } from 'react'
import { Sheet } from '@/app/(app)/live/Sheet'
import { SheetBar, hint, input, label, useCancel, useDirty } from './sheetKit'

// "Or start with the flight there" (the phone's FlightThereSheet): the
// transport form needs both ends of a leg, and with no stops there is no leg
// yet. Ask where it goes first, then the usual transport form opens; once the
// flight is saved, the stop form opens for that place, so the flight joins the
// home → first stop leg straight away. Cancel and Next in the bar (round 3c).
export function FlightThereSheet({ home, onNext, onClose }: { home: string; onNext: (from: string, to: string) => void; onClose: () => void }) {
  const [from, setFrom] = useState(home)
  const [to, setTo] = useState('')
  const ok = !!from.trim() && !!to.trim()
  const cancel = useCancel(useDirty({ from, to }), onClose)
  return (
    <Sheet label="The flight there" onClose={cancel}>
      <SheetBar title="The flight there" onCancel={cancel} onSave={() => onNext(from.trim(), to.trim())} saveLabel="Next" canSave={ok} />
      <label className={label}>
        From
        <input className={input} value={from} placeholder="City" autoComplete="off" onChange={(e) => setFrom(e.target.value)} />
      </label>
      <label className={label}>
        To
        <input className={input} value={to} placeholder="City" autoComplete="off" onChange={(e) => setTo(e.target.value)} />
      </label>
      <p className={hint}>Where the journey starts, and the first place you’re going. After the flight, you add that place as your first stop.</p>
    </Sheet>
  )
}
