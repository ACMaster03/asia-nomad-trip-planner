import { isRevConflict, isPermissionDenied } from '@/lib/trips/queries'

// Rollback banner for failed trip/ledger writes. Pass the mutation's `error` so
// a rev conflict (someone else saved the trip first — migration 06 optimistic
// concurrency) gets its own message; anything else shows the generic retry text.
//
// A permission failure gets a THIRD message on purpose: telling someone whose
// access was just revoked to "please retry" would send them in circles.
export function SaveError({ show, error }: { show: boolean; error?: unknown }) {
  if (!show) return null
  const msg = isPermissionDenied(error)
    ? 'Your edit access to this trip was removed, so the change was rolled back. You can still view the trip — ask the owner if you think this is a mistake.'
    : isRevConflict(error)
      ? 'Someone else changed this trip at the same time — your change was rolled back and the latest version was loaded. Please redo your edit.'
      : "Couldn't save your change — it was rolled back. Please retry."
  return (
    // Amber, not red — the palette has no red; amber owns warnings/risk.
    <div className="mb-3 rounded-[var(--rCtl)] border border-warn-line bg-warn-soft px-3 py-2 text-base text-warn">
      {msg}
    </div>
  )
}
