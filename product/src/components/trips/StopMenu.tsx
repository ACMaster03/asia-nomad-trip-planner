'use client'
import { BedDouble, CircleCheck, CircleDashed, Pencil, Plane, Trash2, type LucideIcon } from 'lucide-react'
import { Sheet } from '@/app/(app)/live/Sheet'
import { legsAround, type Timeline as TimelineModel } from '@/lib/trips/timeline'
import type { Segment, TripState } from '@/lib/trips/types'
import { addStaySheet, type SheetState } from './TripSheets'
import type { TripEdits } from './useTripEdits'

// The long-press menu on a stop card (the phone's StopRow context menu, round
// 3c): quick jumps into the same forms the stop page opens, one one-tap edit
// (in or out of the plan), and Delete, which asks first. A bottom sheet, since
// the web has no menu that lifts the card.
export function StopMenu({ seg, tl, state, edits, openSheet, onClose }: {
  seg: Segment
  tl: TimelineModel
  state: TripState
  edits: TripEdits
  openSheet: (s: SheetState) => void
  onClose: () => void
}) {
  const inPlan = seg.include !== false
  const { leaving } = legsAround(tl, seg.id)
  const city = seg.city || 'this stop'
  const item = (label: string, Icon: LucideIcon, act: () => void, warn = false) => (
    <button key={label} type="button" onClick={act} className={'flex min-h-12 w-full items-center gap-3 text-left text-base font-medium ' + (warn ? 'text-warn' : 'text-tx')}>
      <Icon aria-hidden className="size-[18px] flex-none" strokeWidth={2} /> {label}
    </button>
  )
  return (
    <Sheet label={city} onClose={onClose}>
      <div className="-mt-1 text-center text-base font-semibold text-tx">{seg.city || 'Stop'}</div>
      <div className="divide-y divide-ln">
        {item('Edit stop', Pencil, () => openSheet({ kind: 'stop', seg }))}
        {item('Add stay', BedDouble, () => openSheet(addStaySheet(seg, state)))}
        {inPlan && leaving && item(leaving.to.kind === 'home' ? 'Add transport home' : `Add transport to ${leaving.to.city}`, Plane, () => openSheet({ kind: 'leg', leg: leaving, entry: null }))}
        {inPlan
          ? item('Leave out of the plan', CircleDashed, () => { edits.setInPlan(seg, false); onClose() })
          : item('Put in the plan', CircleCheck, () => { edits.setInPlan(seg, true); onClose() })}
        {item(seg.city ? `Delete ${seg.city}` : 'Delete stop', Trash2, () => { onClose(); void edits.deleteStop(seg) }, true)}
      </div>
    </Sheet>
  )
}
