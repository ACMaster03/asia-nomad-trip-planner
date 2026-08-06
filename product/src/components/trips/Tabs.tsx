'use client'

// Shared capsule sub-nav for the Trip and Money hubs (handoff nav spec):
// white pill container, active segment filled hunter with white text, 15px
// labels, centered. Trip's gear button renders in the same row via `trailing`.
export function Tabs<T extends string>({
  tabs, active, onChange, trailing,
}: {
  tabs: readonly (readonly [T, string])[]
  active: T
  onChange: (t: T) => void
  trailing?: React.ReactNode
}) {
  return (
    <div className="mx-auto flex max-w-5xl items-center justify-center gap-2 px-6 pt-4">
      <nav className="flex w-fit rounded-full border border-ln2 bg-sf p-[3px]">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            onClick={() => onChange(k)}
            className={
              'min-h-[38px] rounded-full px-4 text-[15px] font-medium transition-colors duration-[180ms] ' +
              (active === k ? 'bg-ac text-on' : 'text-tx2 hover:bg-fill')
            }
          >
            {label}
          </button>
        ))}
      </nav>
      {trailing}
    </div>
  )
}
