'use client'
import { shortDate } from '@/lib/trips/timeline'

// Shared vocabulary for the Trip sheets (mock 15 §4–§6): the label and input
// classes every form in the app already uses (AddReminderSheet), the chip
// group, the Idea / Booked pair, a switch, and the "+ Something" link that
// keeps a rarely used field off the screen until it is wanted (#65).

export const label = 'block min-w-0 text-base font-medium text-tx2'
export const input =
  'mt-[5px] w-full rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 py-3 text-base font-medium text-tx outline-none transition-colors duration-[180ms] focus:border-ac disabled:opacity-40'
export const hint = 'text-[13px] leading-snug text-tx2'
export const kicker = 'text-[12px] font-semibold uppercase tracking-[.12em] text-tx2'
export const primaryBtn = 'min-h-[52px] w-full rounded-[calc(var(--r)-2px)] bg-ac text-base font-semibold text-on'
export const dangerBtn =
  'min-h-11 w-full rounded-[calc(var(--r)-2px)] border-[1.5px] border-warn-line py-2.5 text-base font-semibold text-warn'
export const addLink = 'inline-flex min-h-11 items-center text-base font-semibold text-ac2'
export const chipCls = (on: boolean) =>
  'inline-flex min-h-[38px] items-center gap-1.5 rounded-full border-[1.5px] px-[13px] text-[14px] font-medium transition-colors duration-[180ms] ' +
  (on ? 'border-ac bg-ac text-on' : 'border-ln2 bg-sf text-tx2')

export const uid = (p: string) => p + crypto.randomUUID()
/** "24 Nov" — the one spelling on the timeline; the money lines use the same table (timeline.ts). */
export const fmtDay = (iso?: string) => (iso ? shortDate(iso) : '—')
/** 14.58 → "14 h 35". */
export const fmtHours = (h: number) => {
  const whole = Math.floor(h)
  const mins = Math.round((h - whole) * 60)
  return mins ? `${whole} h ${String(mins).padStart(2, '0')}` : `${whole} h`
}

export function Chips<T extends string>({
  value, onChange, options, ariaLabel,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: React.ReactNode }[]
  ariaLabel: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-[7px]">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)} className={chipCls(on)}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Two states everywhere, decided in round 1: an Idea, or Booked. */
export function StateChips({ value, onChange }: { value: 'idea' | 'booked'; onChange: (v: 'idea' | 'booked') => void }) {
  return (
    <Chips
      ariaLabel="State"
      value={value}
      onChange={onChange}
      options={[
        { value: 'idea', label: 'Idea' },
        { value: 'booked', label: 'Booked' },
      ]}
    />
  )
}

export function Toggle({ on, onChange, label: name }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={name}
      onClick={() => onChange(!on)}
      className={'relative h-[30px] w-[50px] flex-none rounded-full transition-colors duration-[180ms] ' + (on ? 'bg-ac' : 'bg-ln3')}
    >
      <span
        aria-hidden
        className={'absolute top-[3px] size-6 rounded-full bg-sf shadow transition-[left] duration-[180ms] ' + (on ? 'left-[23px]' : 'left-[3px]')}
      />
    </button>
  )
}
