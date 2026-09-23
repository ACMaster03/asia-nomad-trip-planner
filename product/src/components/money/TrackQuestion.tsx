'use client'
import { Wallet } from 'lucide-react'
import { Sheet } from '@/app/(app)/live/Sheet'

// The once-per-account question (mock 16 §1, #62): a sheet over the quiet
// page on the first visit to Money, never a page of its own. The heading is
// the exact sentence from #62, and the line under it is the whole pitch: the
// app only asks for a coffee. No projections, cap or pace; those are what the
// page grows into.
//
// Only the two buttons answer. Sliding the sheet away, tapping beside it or
// pressing Escape just closes it, and it comes back the next time the app is
// opened (Petra, 23 Sep, before this merged: panels get swiped away out of
// habit, and a swipe that saved "Not now" would have made a tracker's whole
// spending seem to vanish on the first visit). Once answered it is never
// asked again ("Asked once. Your bookings are here either way."); the "Track
// spending" switch under the first card, on both versions of the page, and a
// cost saved on the quiet page change the answer later.
export function TrackQuestion({ onAnswer, onDismiss }: {
  onAnswer: (track: boolean) => void
  onDismiss: () => void
}) {
  return (
    <Sheet label="Track what you spend on this journey?" onClose={onDismiss}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-[42px] flex-none items-center justify-center rounded-[20px] bg-ac-soft text-ac">
          <Wallet className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <h2 className="text-[20px] font-semibold leading-snug">Track what you spend on this journey?</h2>
          <span className="mt-1 block text-[14px] text-tx2">Log a coffee, see what a day here costs.</span>
        </span>
      </div>
      <button
        type="button"
        onClick={() => onAnswer(true)}
        className="rounded-[var(--rCtl)] bg-ac py-3.5 text-base font-semibold text-on"
      >
        Yes, track it
      </button>
      <button
        type="button"
        onClick={() => onAnswer(false)}
        className="rounded-[var(--rCtl)] border-[1.5px] border-ln3 py-3.5 text-base font-semibold text-tx2"
      >
        Not now
      </button>
      <p className="-mt-0.5 text-center text-[13px] text-tx2">Asked once. Your bookings are here either way.</p>
    </Sheet>
  )
}
