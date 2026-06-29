'use client'

// Shared in-page tab bar for the Itinerary and Money hubs.
export function Tabs<T extends string>({
  tabs, active, onChange,
}: {
  tabs: readonly (readonly [T, string])[]
  active: T
  onChange: (t: T) => void
}) {
  return (
    <div className="mx-auto max-w-5xl px-6 pt-4">
      <nav className="flex flex-wrap gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            onClick={() => onChange(k)}
            className={
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium ' +
              (active === k
                ? 'border-teal-600 text-teal-700 dark:text-teal-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200')
            }
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
