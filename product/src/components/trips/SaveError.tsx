import { isRevConflict } from '@/lib/trips/queries'

// Rollback banner for failed trip/ledger writes. Pass the mutation's `error` so
// a rev conflict (someone else saved the trip first — migration 06 optimistic
// concurrency) gets its own message; anything else shows the generic retry text.
export function SaveError({ show, error }: { show: boolean; error?: unknown }) {
  if (!show) return null
  const msg = isRevConflict(error)
    ? 'Someone else changed this trip at the same time — your change was rolled back and the latest version was loaded. Please redo your edit.'
    : "Couldn't save your change — it was rolled back. Please retry."
  return (
    <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40">
      {msg}
    </div>
  )
}
