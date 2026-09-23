'use client'

// "Track spending" on the full Money page, next to the Budget cap row (Petra,
// 23 Sep: easier to reach here than under the avatar, where mock 16 first put
// it). The answer is the person's, not the journey's, so switching it off
// quiets only your own Money page; the line under it says so, because a
// switch on a journey's page reads like a setting for everyone on it. It says
// only "Only for you.": "on every journey", true as it is, read as a
// contradiction of the question's "this journey" (Petra, 23 Sep). The quiet
// page's "Track it ›" line is the way back on.
export function TrackSpendingRow({ onChange }: { onChange: (on: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--r)] bg-sf px-[18px] py-3.5">
      <span>
        <span className="block text-base font-semibold">Track spending</span>
        <span className="block text-[13px] text-tx2">Only for you.</span>
      </span>
      <button
        role="switch"
        aria-checked
        aria-label="Track spending"
        onClick={() => onChange(false)}
        className="relative h-[31px] w-[52px] flex-none rounded-full bg-ac transition-colors duration-[180ms]"
      >
        <span className="absolute left-[24px] top-[3px] block h-[25px] w-[25px] rounded-full bg-sf transition-[left] duration-[180ms]" />
      </button>
    </div>
  )
}
