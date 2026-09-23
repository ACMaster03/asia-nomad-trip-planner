'use client'
import { SaveError } from '@/components/trips/SaveError'
import { useSetTrackSpending, useTrackSpending } from '@/lib/trips/useTrackSpending'

// "Track spending" on the Account page (mock 16 §2: "the same switch lives
// under your avatar"), because the answer belongs to the person, not to a
// journey. It is the Money question's answer, changeable either way. Hidden
// while the answer cannot be read, rather than showing a switch that lies.
export function TrackSpendingCard() {
  const track = useTrackSpending()
  const setTrack = useSetTrackSpending()
  const t = track.data
  if (!t || t === 'unknown') return null
  const on = t === 'yes'
  const line =
    t === 'yes' ? 'Money shows what you spend, day by day.'
      : t === 'no' ? 'Money shows your bookings and what you add.'
        : 'Money asks you on your next visit.'
  return (
    <section className="rounded-[var(--r)] bg-sf p-4">
      <h2 className="font-serif text-[19px] font-semibold">Money</h2>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span>
          <span className="block text-base font-semibold">Track spending</span>
          <span className="block text-base text-tx2">{line}</span>
        </span>
        <button
          role="switch"
          aria-checked={on}
          aria-label="Track spending"
          onClick={() => setTrack.mutate(!on)}
          className={'relative h-[31px] w-[52px] flex-none rounded-full transition-colors duration-[180ms] ' + (on ? 'bg-ac' : 'bg-ln2')}
        >
          <span
            className={'absolute top-[3px] block h-[25px] w-[25px] rounded-full bg-sf transition-[left] duration-[180ms] ' + (on ? 'left-[24px]' : 'left-[3px]')}
          />
        </button>
      </div>
      <div className="mt-2 empty:hidden">
        <SaveError show={setTrack.isError} error={setTrack.error} />
      </div>
    </section>
  )
}
