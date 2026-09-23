'use client'

// "Track spending": one switch, right under the first card of Money on both
// versions of the page. On the full page it sits under the overview, on; on
// the quiet page under the Bookings card, off, where the "Track it ›" line
// used to be. Petra, 23 Sep, after #79 went live: at the bottom of the page,
// next to the Budget cap row, you had to scroll to nearly the end to notice
// the switch exists (and before that, mock 16 had put it under the avatar).
// It mirrors the page shown, so flipping it always does what it looks like.
//
// Slim, because trackers see it every day between the overview and Latest,
// and in the soft tag colours of the quiet page's old "Track it ›" line on both
// versions (Petra, the same afternoon: "the same look as when someone only sees
// the bookings"), with "Track spending" in the line's mauve.
// The answer is the person's, not the journey's: switching it off quiets only
// your own Money page, which is what "Only for you." says. It does not say
// "on every journey", which read as a contradiction of the question's "this
// journey".
export function TrackSpendingRow({ on, onChange, className = '' }: {
  on: boolean
  onChange: (on: boolean) => void
  className?: string
}) {
  return (
    <div className={'flex min-h-11 items-center justify-between gap-2.5 rounded-[14px] bg-tag px-3.5 py-2.5 text-[14px] text-tag-ink ' + className}>
      <span className="min-w-0">
        <b className="block font-semibold text-ac2-deep">Track spending</b>
        <span className="block">{on ? 'Only for you.' : 'Spending isn’t tracked on this journey.'}</span>
      </span>
      <button
        role="switch"
        aria-checked={on}
        aria-label="Track spending"
        onClick={() => onChange(!on)}
        className={'relative h-[31px] w-[52px] flex-none rounded-full transition-colors duration-[180ms] ' + (on ? 'bg-ac' : 'bg-ln3')}
      >
        <span
          className={'absolute top-[3px] block h-[25px] w-[25px] rounded-full bg-sf transition-[left] duration-[180ms] ' + (on ? 'left-[24px]' : 'left-[3px]')}
        />
      </button>
    </div>
  )
}
