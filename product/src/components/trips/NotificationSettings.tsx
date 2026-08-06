'use client'
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  disableUserPush,
  enableUserPush,
  fetchNotifyPrefs,
  getUserPushState,
  updateNotifyPrefs,
  type NotifyPrefs,
  type UserPushState,
} from '@/lib/trips/userPush'

// Settings → Alerts (LIVHOLD v1 frame 27b). Each alert the backend actually
// supports (migration 27) gets its own switch row; the denied state mirrors the
// personalisation flow's P5b amber notice, with email as the stated fallback.

const PREFS_KEY = ['notify-prefs'] as const

function Toggle({ on, disabled, label, onChange }: { on: boolean; disabled?: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={
        'relative h-[31px] w-[52px] flex-none rounded-full transition-colors duration-[180ms] disabled:opacity-50 ' +
        (on ? 'bg-ac' : 'bg-ln2')
      }
    >
      <span
        className={
          'absolute top-[3px] block h-[25px] w-[25px] rounded-full bg-sf transition-[left] duration-[180ms] ' +
          (on ? 'left-[24px]' : 'left-[3px]')
        }
      />
    </button>
  )
}

export function NotificationSettings() {
  const sb = createClient()
  const qc = useQueryClient()
  const [pushState, setPushState] = useState<UserPushState>('unsupported')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getUserPushState().then(setPushState)
  }, [])

  const prefs = useQuery({ queryKey: PREFS_KEY, queryFn: () => fetchNotifyPrefs(sb) })

  const savePrefs = useMutation({
    mutationFn: (patch: Partial<NotifyPrefs>) => updateNotifyPrefs(sb, patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: PREFS_KEY })
      const prev = qc.getQueryData<NotifyPrefs>(PREFS_KEY)
      if (prev) qc.setQueryData(PREFS_KEY, { ...prev, ...patch })
      return { prev }
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.prev) qc.setQueryData(PREFS_KEY, ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: PREFS_KEY }),
  })

  async function togglePush() {
    setBusy(true)
    try {
      setPushState(pushState === 'subscribed' ? await disableUserPush(sb) : await enableUserPush(sb))
    } finally {
      setBusy(false)
    }
  }

  const denied = pushState === 'denied'
  const deadlineOn = prefs.data?.notifyDeadlinePush ?? true
  const eventOn = prefs.data?.notifyEventPush ?? true

  const rows: { title: string; desc: string; on: boolean; patch: (v: boolean) => Partial<NotifyPrefs> }[] = [
    {
      title: 'Free-cancellation deadline',
      desc: 'and card charges · push 7 and 1 days before',
      on: deadlineOn,
      patch: (v) => ({ notifyDeadlinePush: v }),
    },
    {
      title: 'Trip updates from co-travellers',
      desc: 'check-ins, arrivals, notes',
      on: eventOn,
      patch: (v) => ({ notifyEventPush: v }),
    },
  ]

  return (
    <section className="mt-3 flex flex-col gap-3">
      <h2 className="font-serif text-[19px] font-semibold">Alerts</h2>
      <p className="text-base leading-normal text-tx2">
        {pushState === 'subscribed'
          ? 'Push is allowed on this phone. Email stays the fallback for anything switched off.'
          : 'Deadline warnings always go to your email. Push adds a buzz on this device.'}
      </p>

      {/* P5b mirror — the amber system-level notice, copy and markup shared
          with the personalisation flow's alerts step. */}
      {denied && (
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

      {pushState === 'ios-install' && (
        <div className="rounded-[var(--r)] bg-tag px-4 py-3.5 text-base leading-normal text-tag-ink">
          On iPhone, push needs the installed app: Share → <b>Add to Home Screen</b>, then enable
          it from there.
        </div>
      )}
      {pushState === 'unsupported' && (
        <div className="rounded-[var(--r)] bg-tag px-4 py-3.5 text-base leading-normal text-tag-ink">
          This browser does not support push. Alerts arrive by email.
        </div>
      )}

      <div className="rounded-[var(--r)] bg-sf px-4 py-0.5">
        {rows.map((r, i) => (
          <div
            key={r.title}
            className={'flex items-center gap-3 py-3.5' + (i < rows.length - 1 ? ' border-b border-ln' : '')}
          >
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold">{r.title}</div>
              <div className="mt-0.5 text-base leading-normal text-tx2">
                {r.desc}
                {denied && r.on ? ' · by email for now' : ''}
              </div>
            </div>
            <Toggle on={r.on} disabled={prefs.isPending} label={r.title} onChange={(v) => savePrefs.mutate(r.patch(v))} />
          </div>
        ))}
      </div>

      {(pushState === 'ready' || pushState === 'subscribed') && (
        <button
          onClick={togglePush}
          disabled={busy}
          className={
            pushState === 'subscribed'
              ? 'rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln3 px-4 py-3 text-base font-semibold text-tx2 disabled:opacity-50'
              : 'rounded-[calc(var(--r)-2px)] bg-ac px-4 py-3.5 text-base font-semibold text-on disabled:opacity-50'
          }
        >
          {busy ? '…' : pushState === 'subscribed' ? 'Disable push on this device' : 'Enable push on this device'}
        </button>
      )}

      {savePrefs.isError && (
        <p className="text-base text-ac2">Could not save — is migration 27 applied to this database?</p>
      )}
    </section>
  )
}
