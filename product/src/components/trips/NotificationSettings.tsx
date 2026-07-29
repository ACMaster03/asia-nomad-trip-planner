'use client'
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

// TEST HARNESS UI (gap 4). Deliberately bare: it exists so the backend —
// migration 27 + push-fanout + stay-deadline-alerts — can be exercised on a
// real phone before the designed Settings screen lands. The approved endframe
// for this section comes with the UI phase; replace this block then, keep the
// lib calls.

const PREFS_KEY = ['notify-prefs'] as const

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

  return (
    <section className="mt-8 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="mb-1 text-lg font-semibold">Notifications</h2>
      <p className="mb-3 text-sm text-neutral-500">
        Deadline warnings always go to your email. Push adds a buzz on this device.
      </p>

      {pushState === 'ios-install' && (
        <p className="text-sm text-neutral-500">
          On iPhone, push needs the installed app: Share → <b>Add to Home Screen</b>, then enable
          it from there.
        </p>
      )}
      {pushState === 'denied' && (
        <p className="text-sm text-neutral-500">
          Notifications are blocked for this app in your device settings.
        </p>
      )}
      {pushState === 'unsupported' && (
        <p className="text-sm text-neutral-500">This browser does not support push.</p>
      )}
      {(pushState === 'ready' || pushState === 'subscribed') && (
        <button
          onClick={togglePush}
          disabled={busy}
          className="rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? '…' : pushState === 'subscribed' ? 'Disable push on this device' : 'Enable push on this device'}
        </button>
      )}

      <div className="mt-4 space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={prefs.data?.notifyDeadlinePush ?? true}
            disabled={prefs.isPending}
            onChange={(e) => savePrefs.mutate({ notifyDeadlinePush: e.target.checked })}
          />
          Stay deadlines (free-cancellation ends, card charged) — push 7 and 1 days before
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={prefs.data?.notifyEventPush ?? true}
            disabled={prefs.isPending}
            onChange={(e) => savePrefs.mutate({ notifyEventPush: e.target.checked })}
          />
          Trip updates from co-travellers (check-ins, arrivals, notes)
        </label>
        {savePrefs.isError && (
          <p className="text-red-600">Could not save — is migration 27 applied to this database?</p>
        )}
      </div>
    </section>
  )
}
