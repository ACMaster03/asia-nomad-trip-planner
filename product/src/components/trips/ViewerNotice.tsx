'use client'
import { useTripRole } from '@/lib/trips/useTripRole'

// The read-only banner every editable screen shows to a viewer.
//
// Deliberately ONE component rather than a per-screen message: a viewer who
// opens Stops, Stays and Money should get the same sentence in the same place
// each time, so "read-only" reads as a property of the trip rather than as
// something broken on this particular screen.
//
// Renders nothing while the role is unresolved ('unknown') — see useTripRole.
export function ViewerNotice() {
  const { isViewer, hasNoAccess } = useTripRole()
  if (!isViewer && !hasNoAccess) return null
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900">
      <span aria-hidden>👁️</span>
      <p className="text-neutral-600 dark:text-neutral-400">
        {hasNoAccess ? (
          <>
            <span className="font-medium text-neutral-800 dark:text-neutral-200">You no longer have access to this trip.</span>{' '}
            It may have been deleted, or your invite was withdrawn.
          </>
        ) : (
          <>
            <span className="font-medium text-neutral-800 dark:text-neutral-200">Read-only.</span>{' '}
            You were invited to this trip as a viewer — you can see everything, but only the
            owner and co-editors can change it.
          </>
        )}
      </p>
    </div>
  )
}
