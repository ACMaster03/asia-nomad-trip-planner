'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { writeState } from '@/lib/trips/queries'
import { useTripScreen } from '@/lib/trips/useTripScreen'

// Personalisation flow — handoff section F (P1–P7): six skippable steps
// straight after Create trip, ending in the recap. Every answer also lives in
// Settings; nothing here is a one-time trap. Choices persist as
// state.meta.personalisation (JSON — no migration needed); theme + larger-text
// apply live and live in localStorage (lv-theme / lv-larger), matching the
// resolver in the root layout.
//
// ?short=1 is Anna's co-editor variant (invite door): only the personal steps
// (followers, alerts, theme); trip-level rows on the recap read "already set
// for the trip".

type Who = 'Just me' | 'Two of us' | 'A small group'
type Tier = 'Frugal' | 'Comfortable' | 'Generous'
type Followers = 'Family link + weekly email' | 'Link only' | 'Nobody yet'
type Theme = 'Light' | 'Dark' | 'System'

export interface Personalisation {
  who?: Who
  names?: string[]
  nights?: number
  tier?: Tier
  currency?: string
  passports?: string[]
  followers?: Followers
  linkName?: string
  digestEmails?: string
  alerts?: string[]
  theme?: Theme
  larger?: boolean
}

const STEPS = ['who', 'pace', 'currency', 'followers', 'alerts', 'theme'] as const
type StepKey = (typeof STEPS)[number]

const TIERS: Array<{ name: Tier; desc: string; price: string }> = [
  { name: 'Frugal', desc: 'hostels, street food', price: '10 000 Ft' },
  { name: 'Comfortable', desc: 'private apartment', price: '17 000 Ft' },
  { name: 'Generous', desc: 'central, restaurants', price: '28 000 Ft' },
]
const ALERT_OPTS = [
  { name: 'Deadlines', desc: 'free-cancel dates and visa windows' },
  { name: 'Charges', desc: 'when money is about to leave the account' },
  { name: 'Partner activity', desc: 'when your co-editor books or changes a stop' },
]
const FOLLOWER_OPTS: Array<{ name: Followers; desc: string }> = [
  { name: 'Family link + weekly email', desc: 'the full setup' },
  { name: 'Link only', desc: 'no email digests' },
  { name: 'Nobody yet', desc: 'travel privately for now' },
]

function applyTheme(theme: Theme) {
  const key = theme.toLowerCase()
  try {
    localStorage.setItem('lv-theme', key)
  } catch {}
  const dark = theme === 'Dark' || (theme === 'System' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
}
function applyLarger(on: boolean) {
  try {
    localStorage.setItem('lv-larger', on ? '1' : '')
  } catch {}
  document.documentElement.toggleAttribute('data-large', on)
}

// "Mauve lead-in words" note pattern: 'Lead|rest of the sentence'.
function Note({ lines }: { lines: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      {lines.map((l) => {
        const [lead, rest] = l.split('|')
        return (
          <p key={l} className="text-base leading-normal text-tx2">
            <span className="font-semibold text-ac2-deep">{lead}</span> {rest}
          </p>
        )
      })}
    </div>
  )
}

function Check({ on }: { on: boolean }) {
  return on ? (
    <span className="flex h-6 w-6 flex-none items-center justify-center rounded-lg bg-ac text-[14px] font-semibold text-on">✓</span>
  ) : (
    <span className="h-6 w-6 flex-none" aria-hidden />
  )
}

const card = 'rounded-[var(--r)] bg-sf p-4 text-tx'
const optCard = (on: boolean) =>
  `flex w-full items-center gap-3 rounded-[var(--r)] border-2 bg-sf p-4 text-left transition-[border-color,transform] duration-[180ms] ${on ? 'translate-x-[2px] border-ac' : 'border-fill2'}`
const pill = (on: boolean) =>
  `rounded-full px-[15px] py-2.5 text-base transition-colors duration-[180ms] ${on ? 'bg-ac font-semibold text-on' : 'border-[1.5px] border-ln2 font-medium text-tx'}`
const inputCls =
  'mt-[7px] w-full rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 py-3 text-base font-medium text-tx outline-none transition-colors duration-[180ms] focus:border-ac'

export default function PersonalisationFlow() {
  const sb = createClient()
  const router = useRouter()
  const short = useSearchParams().get('short') === '1'
  const { trip } = useTripScreen()

  const steps = useMemo(() => (short ? STEPS.slice(3) : STEPS), [short])
  const [stepIdx, setStepIdx] = useState(0)
  const [recap, setRecap] = useState(false)
  const [c, setC] = useState<Personalisation>({ names: ['', ''], passports: [''], alerts: [] })
  const [pushDenied, setPushDenied] = useState(false)
  const patch = (p: Partial<Personalisation>) => setC((prev) => ({ ...prev, ...p }))

  const key: StepKey = steps[Math.min(stepIdx, steps.length - 1)]
  const nights = c.nights ?? 30
  const tier = c.tier ?? 'Comfortable'
  const currency = c.currency ?? trip.data?.state.meta.baseCurrency ?? 'HUF'
  const theme = c.theme ?? 'Light'

  // Push permission is asked when the FIRST alert is picked, with the reason
  // in front of you (P5); a system-level denial flips the P5b email fallback.
  async function toggleAlert(name: string) {
    const has = c.alerts?.includes(name)
    patch({ alerts: has ? c.alerts!.filter((a) => a !== name) : [...(c.alerts ?? []), name] })
    if (!has && typeof Notification !== 'undefined') {
      if (Notification.permission === 'denied') setPushDenied(true)
      else if (Notification.permission === 'default') {
        const res = await Notification.requestPermission().catch(() => 'denied')
        if (res === 'denied') setPushDenied(true)
      }
    }
  }

  // One write at the end — choices land in state.meta.personalisation (and the
  // base currency follows the P3 pick). Rev-guarded like every other write.
  const save = useMutation({
    mutationFn: async () => {
      const t = trip.data
      if (!t) return
      const personalisation = { ...c, nights, tier, currency, theme, short }
      const next = {
        ...t.state,
        meta: { ...t.state.meta, baseCurrency: currency, personalisation },
      }
      await writeState(sb, t.id, next, t.state_rev)
    },
    onSuccess: () => router.push('/dashboard'),
  })

  function next() {
    if (stepIdx >= steps.length - 1) setRecap(true)
    else setStepIdx(stepIdx + 1)
  }

  /* ── recap (P7) ── */
  if (recap) {
    const headline = short
      ? `You're in${c.names?.[0] ? `, ${c.names[0]}` : ''}`
      : c.who === 'Just me'
        ? 'Set up for one'
        : c.who === 'A small group'
          ? 'Set up for the group'
          : 'Set up for two'
    const rows: Array<{ label: string; value: string; href: string }> = [
      {
        label: 'Travellers',
        value: short ? 'already set for the trip' : c.who ? `${c.who}${c.who === 'Two of us' ? ' · per-person totals on' : ''}` : 'skipped - default kept',
        href: '/settings',
      },
      {
        label: 'Pace & tier',
        value: short ? 'already set for the trip' : `${nights} nights · ${tier.toLowerCase()} · ${TIERS.find((t) => t.name === tier)!.price} a day for two`,
        href: '/settings',
      },
      {
        label: 'Currency & passport',
        value: short ? 'already set for the trip' : `${currency}${c.passports?.[0]?.trim() ? ` · ${c.passports[0].trim()} passport` : ''}`,
        href: '/settings',
      },
      {
        label: 'Followers',
        value:
          c.followers === 'Family link + weekly email'
            ? `“${c.linkName?.trim() || 'Family'}” link · weekly digest`
            : c.followers === 'Link only'
              ? `“${c.linkName?.trim() || 'Family'}” link only`
              : c.followers === 'Nobody yet'
                ? 'nobody yet'
                : 'skipped - default kept',
        href: '/settings',
      },
      {
        label: 'Alerts',
        value: c.alerts?.length ? c.alerts.join(' + ') + (pushDenied ? ' · by email for now' : ' · push allowed') : 'email only',
        href: '/settings',
      },
      { label: 'Appearance', value: `${theme} · every size one notch up: ${c.larger ? 'on' : 'off'}`, href: '/settings' },
    ]
    return (
      <main
        className="flex min-h-dvh flex-col gap-3.5 px-[18px] pb-6 pt-[22px]"
        style={{ background: 'var(--washLight)', color: 'var(--washInk)' }}
      >
        <div className="lv-enter">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
          <img src="/brand/livhold-mark.png" alt="" width={48} height={48} />
          <h1 className="mt-[11px] font-serif text-[29px] font-semibold leading-[1.15] tracking-[-.01em]">{headline}</h1>
          <p className="mt-2 text-base leading-relaxed text-tx2">Everything below is editable in Settings. Tap any row to jump there.</p>
        </div>
        <div className="rounded-[var(--r)] bg-sf px-4 py-1 text-tx">
          {rows.map((r, i) => (
            <Link
              key={r.label}
              href={r.href}
              className={'flex items-center justify-between py-3.5 ' + (i < rows.length - 1 ? 'border-b border-ln' : '')}
            >
              <span>
                <span className="block text-base font-semibold">{r.label}</span>
                <span className="mt-0.5 block text-base text-tx2">{r.value}</span>
              </span>
              <span aria-hidden className="text-xl text-ac2">›</span>
            </Link>
          ))}
        </div>
        <div className="rounded-[var(--r)] bg-tag px-4 py-3.5 text-base leading-normal text-tag-ink">
          Next: add your stops. Each one turns your pace and tier into a real estimate - we&apos;ll warn you at 90% of the cap.
        </div>
        {save.isError && (
          <div className="rounded-[calc(var(--r)-2px)] border border-warn-line bg-warn-soft px-3 py-2 text-base text-warn">
            Couldn&apos;t save your setup — it still applies on this phone. Retry, or adjust later in Settings.
          </div>
        )}
        <div className="mt-auto flex flex-col gap-[11px]">
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="rounded-[var(--r)] bg-ac py-[17px] text-[17px] font-semibold text-on disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : 'Start planning →'}
          </button>
          <button
            onClick={() => {
              setRecap(false)
              setStepIdx(0)
              setC({ names: ['', ''], passports: [''], alerts: [] })
              if (short) router.replace('/welcome')
            }}
            className="rounded-[22px] border-[1.5px] border-ac2 bg-blush py-[15px] text-base font-semibold text-ac2-deep"
          >
            Redo the setup
          </button>
        </div>
      </main>
    )
  }

  /* ── steps P1–P6 ── */
  const titles: Record<StepKey, { title: string; blurb?: string }> = {
    who: { title: "Who's going?", blurb: 'It decides whether prices are shown per person and whether the feed says “you” or names.' },
    pace: { title: 'How you like to travel' },
    currency: { title: 'Money & paperwork', blurb: 'Two answers that quietly power every other screen.' },
    followers: { title: 'Who should be able to watch?', blurb: 'One link, no accounts. They never see money, private notes or exact GPS.' },
    alerts: { title: 'What should we interrupt you for?', blurb: 'Pick any - each becomes a push notification. Pick none and alerts stay email-only.' },
    theme: { title: 'Make it yours', blurb: 'Dark mode matters at 2am in an airport. Pick once, change any time.' },
  }
  const last = stepIdx === steps.length - 1

  return (
    <main className="flex min-h-dvh flex-col bg-pg text-tx">
      {/* progress + skip-to-recap */}
      <div className="flex items-center gap-[11px] px-4 py-3">
        <div className="h-[5px] flex-1 overflow-hidden rounded-[3px] bg-track">
          <div
            className="h-full rounded-[3px] bg-ac transition-[width] duration-[450ms] ease-[cubic-bezier(.2,.8,.2,1)]"
            style={{ width: `${Math.round(((stepIdx + 1) / steps.length) * 100)}%` }}
          />
        </div>
        <button onClick={() => setRecap(true)} className="text-base font-medium text-ac2">Skip</button>
      </div>

      <div className="flex flex-1 flex-col gap-3.5 px-[18px] pb-6 pt-1">
        <div>
          <div className="text-base uppercase tracking-[.12em] text-ac2">Step {stepIdx + 1} of {steps.length}</div>
          <h1 className="mt-2 font-serif text-[29px] font-semibold leading-[1.15] tracking-[-.01em]">{titles[key].title}</h1>
          {titles[key].blurb && <p className="mt-2 text-base leading-relaxed text-tx2">{titles[key].blurb}</p>}
        </div>

        {key === 'who' && (
          <>
            {(['Just me', 'Two of us', 'A small group'] as Who[]).map((w, i) => (
              <button key={w} onClick={() => patch({ who: w })} className={optCard(c.who === w)}>
                <span className={'flex h-11 w-11 flex-none items-center justify-center rounded-[calc(var(--r)-1px)] ' + (c.who === w ? 'bg-ac-soft' : 'bg-tag')}>
                  <span className="flex items-center -space-x-1">
                    {Array.from({ length: i + 1 }).map((_, d) => (
                      <span key={d} className={'block rounded-full ' + (d === 1 && c.who === w ? 'bg-ac2' : 'bg-tx2/50')} style={{ width: 15 - d * 2, height: 15 - d * 2 }} />
                    ))}
                  </span>
                </span>
                <span className="flex-1">
                  <span className="block text-[17px] font-semibold">{w}</span>
                  <span className="block text-base text-tx2">
                    {w === 'Just me' ? 'One set of costs, no splits' : w === 'Two of us' ? 'Per-person totals, shared ledger' : '3+ · set the number next'}
                  </span>
                </span>
                <Check on={c.who === w} />
              </button>
            ))}
            {c.who && (
              <div className={card + ' lv-enter'}>
                <div className="text-base font-medium text-tx2">Names for the feed</div>
                <div className="mt-1 grid grid-cols-2 gap-2.5">
                  {(c.who === 'A small group' ? ['You', 'Them', 'Them'] : ['You', 'Them']).map((label, i) => (
                    <label key={i} className="block text-base text-tx2">
                      {label}
                      <input
                        className={inputCls}
                        value={c.names?.[i] ?? ''}
                        onChange={(e) => {
                          const names = [...(c.names ?? [])]
                          names[i] = e.target.value
                          patch({ names })
                        }}
                        placeholder={i === 0 ? 'Patrik' : 'Anna'}
                      />
                    </label>
                  ))}
                  {c.who === 'A small group' && (
                    <button
                      onClick={() => patch({ names: [...(c.names ?? []), ''] })}
                      className="mt-[26px] rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 py-3 text-base font-medium text-ac2"
                    >
                      ＋ add a name
                    </button>
                  )}
                </div>
                <p className="mt-2.5 text-base leading-normal text-tx3">
                  Just what the feed calls you. Inviting them to edit the trip happens later, by email.
                </p>
              </div>
            )}
          </>
        )}

        {key === 'pace' && (
          <>
            <div className={card}>
              <div className="text-base font-medium text-tx2">Typical stay per city</div>
              <div className="mt-1">
                <span className="text-[30px] font-semibold">{nights}</span>{' '}
                <span className="text-[17px] font-semibold">nights</span>
              </div>
              <input
                type="range"
                min={3}
                max={60}
                value={nights}
                onChange={(e) => patch({ nights: Number(e.target.value) })}
                className="mt-2 w-full"
                style={{ accentColor: 'var(--ac)' }}
                aria-label="Typical stay per city, nights"
              />
              <div className="mt-2 flex justify-between text-base text-tx2">
                <span>3 nights · fast</span>
                <span>60+ · slow</span>
              </div>
            </div>
            <div className={card}>
              <div className="flex items-baseline gap-2">
                <span className="text-base font-medium text-tx2">Comfort tier</span>
                <span className="text-base text-tx3">a day for two · stay + spending</span>
              </div>
              <div className="mt-[11px] flex flex-col gap-[9px]">
                {TIERS.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => patch({ tier: t.name })}
                    className={
                      'flex items-center gap-[11px] rounded-[calc(var(--r)-2px)] border-2 p-[11px] text-left transition-colors duration-[180ms] ' +
                      (tier === t.name ? 'border-ac' : 'border-fill2')
                    }
                  >
                    <span className="flex-1">
                      <span className="block text-base font-semibold">{t.name}</span>
                      <span className="block text-base text-tx2">{t.desc}</span>
                    </span>
                    <span className="text-base font-medium">{t.price}</span>
                    <Check on={tier === t.name} />
                  </button>
                ))}
              </div>
              <div className="mt-3 border-t border-ln pt-[11px]">
                <Note lines={["Daily estimate|is set for any stop you haven't booked yet", 'Per stop|you can change the tier later']} />
              </div>
            </div>
          </>
        )}

        {key === 'currency' && (
          <>
            <div className={card}>
              <div className="text-base font-medium text-tx2">Show all totals in</div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {['HUF', 'EUR', 'USD', 'GBP'].map((cur) => (
                  <button key={cur} onClick={() => patch({ currency: cur })} className={pill(currency === cur)}>
                    {cur}
                  </button>
                ))}
              </div>
              <p className="mt-[11px] text-base leading-normal text-tx2">Local currencies are added on their own as stops appear.</p>
            </div>
            <div className={card}>
              <div className="text-base font-medium text-tx2">Passport(s) you&apos;ll travel on</div>
              <div className="mt-2 flex flex-col gap-2">
                {(c.passports ?? ['']).map((p, i) => (
                  <input
                    key={i}
                    className={inputCls + ' mt-0'}
                    value={p}
                    onChange={(e) => {
                      const passports = [...(c.passports ?? [''])]
                      passports[i] = e.target.value
                      patch({ passports })
                    }}
                    placeholder={i === 0 ? 'Hungary' : 'Another passport'}
                    aria-label={`Passport ${i + 1}`}
                  />
                ))}
                <button
                  onClick={() => patch({ passports: [...(c.passports ?? ['']), ''] })}
                  className="self-start rounded-full border-[1.5px] border-ln2 px-[15px] py-2.5 text-base font-medium text-ac2"
                >
                  ＋ add another
                </button>
              </div>
              <div className="mt-3">
                <Note lines={['Visa costs|land in Itinerary → Extras as you add them', 'Deadline alerts|cover visa windows automatically']} />
              </div>
            </div>
          </>
        )}

        {key === 'followers' && (
          <>
            {FOLLOWER_OPTS.map((f) => (
              <button key={f.name} onClick={() => patch({ followers: f.name })} className={optCard(c.followers === f.name)}>
                <span className="flex-1">
                  <span className="block text-[17px] font-semibold">{f.name}</span>
                  <span className="block text-base text-tx2">{f.desc}</span>
                </span>
                <Check on={c.followers === f.name} />
              </button>
            ))}
            {c.followers && c.followers !== 'Nobody yet' && (
              <div className={card + ' lv-enter'}>
                <label className="block text-base font-medium text-tx2">
                  Name this link
                  <input className={inputCls} value={c.linkName ?? ''} onChange={(e) => patch({ linkName: e.target.value })} placeholder="Family" />
                </label>
                {c.followers === 'Family link + weekly email' && (
                  <label className="mt-3 block text-base font-medium text-tx2">
                    Weekly digest to
                    <textarea
                      className={inputCls + ' min-h-[76px] whitespace-pre-line'}
                      value={c.digestEmails ?? ''}
                      onChange={(e) => patch({ digestEmails: e.target.value })}
                      placeholder={'nagyi@example.com\nmama@example.com'}
                    />
                  </label>
                )}
                <p className="mt-2.5 text-base leading-normal text-tx2">They confirm by email first. Quiet weeks send nothing at all.</p>
              </div>
            )}
            <div className="rounded-[var(--r)] bg-tag px-4 py-3.5 text-base leading-normal text-tag-ink">
              Prefer to travel privately? Skip - nothing is shared until you make a link.
            </div>
          </>
        )}

        {key === 'alerts' && (
          <>
            {pushDenied && (
              <div className="lv-enter flex gap-[11px] rounded-[var(--r)] border-[1.5px] border-warn-line bg-warn-soft p-4">
                <TriangleAlert aria-hidden className="mt-0.5 size-5 flex-none text-warn" strokeWidth={2} />
                <div>
                  <div className="text-base font-semibold text-warn">Push is off at the system level</div>
                  <p className="mt-1 text-base leading-normal text-tx2">
                    Your phone blocked notifications for Livhold, so these alerts will arrive by{' '}
                    <span className="font-semibold text-ac2-deep">email</span> instead. Nothing is lost.
                  </p>
                  <p className="mt-2 text-base font-medium text-ac2-deep underline">Enable in phone Settings →</p>
                </div>
              </div>
            )}
            {ALERT_OPTS.map((a) => {
              const on = c.alerts?.includes(a.name) ?? false
              return (
                <button key={a.name} onClick={() => toggleAlert(a.name)} className={optCard(on) + (pushDenied && on ? ' opacity-80' : '')}>
                  <span className="flex-1">
                    <span className="block text-[17px] font-semibold">{a.name}</span>
                    <span className="block text-base text-tx2">
                      {a.desc}
                      {pushDenied && on ? ' · by email for now' : ''}
                    </span>
                  </span>
                  <Check on={on} />
                </button>
              )
            })}
            <div className="rounded-[var(--r)] bg-tag px-4 py-3.5">
              {pushDenied ? (
                <p className="text-base leading-normal text-tag-ink">Settings → Alerts shows the same notice until push is allowed, with the same shortcut.</p>
              ) : (
                <Note lines={['Push permission|is asked when you pick one, with the reason in front of you', 'In Settings|each alert has its own switch']} />
              )}
            </div>
          </>
        )}

        {key === 'theme' && (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              {(['Light', 'Dark', 'System'] as Theme[]).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    patch({ theme: t })
                    applyTheme(t) // instant — the whole app flips with the pick
                  }}
                  className={'rounded-[var(--r)] border-2 bg-sf p-2.5 transition-colors duration-[180ms] ' + (theme === t ? 'border-ac' : 'border-fill2')}
                >
                  <span
                    className="block h-[74px] rounded-[9px] p-2"
                    style={{
                      background:
                        t === 'Light' ? '#E8F7EE' : t === 'Dark' ? '#161A18' : 'linear-gradient(115deg,#E8F7EE 50%,#161A18 50%)',
                    }}
                  >
                    <span className="block h-2 w-[70%] rounded" style={{ background: t === 'Dark' ? '#1F2622' : '#fff' }} />
                    <span className="mt-1.5 block h-[22px] rounded" style={{ background: t === 'Dark' ? '#1F2622' : '#fff' }} />
                    <span className="mt-1.5 block h-2 w-[45%] rounded" style={{ background: t === 'Dark' ? '#7FA37D' : '#3F5A3E' }} />
                  </span>
                  <span className="mt-[9px] block text-center text-base font-semibold text-tx">{t}</span>
                </button>
              ))}
            </div>
            <div className={card + ' flex items-center justify-between gap-3'}>
              <span>
                <span className="block text-base font-semibold">Larger text</span>
                <span className="block text-base text-tx2">Every size steps up one notch</span>
              </span>
              <button
                role="switch"
                aria-checked={!!c.larger}
                aria-label="Larger text"
                onClick={() => {
                  patch({ larger: !c.larger })
                  applyLarger(!c.larger)
                }}
                className={'relative h-[31px] w-[52px] flex-none rounded-full transition-colors duration-[180ms] ' + (c.larger ? 'bg-ac' : 'bg-ln2')}
              >
                <span
                  className={'absolute top-[3px] block h-[25px] w-[25px] rounded-full bg-sf transition-[left] duration-[180ms] ' + (c.larger ? 'left-[24px]' : 'left-[3px]')}
                />
              </button>
            </div>
          </>
        )}

        <button onClick={next} className="mt-auto rounded-[var(--r)] bg-ac py-[17px] text-[17px] font-semibold text-on">
          {last ? 'See my setup' : 'Continue'}
        </button>
      </div>
    </main>
  )
}
