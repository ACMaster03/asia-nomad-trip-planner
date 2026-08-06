'use client'
import { Eye } from 'lucide-react'
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
    <div className="mb-4 flex items-start gap-2 rounded-[var(--rCtl)] border border-ln2 bg-sf px-3 py-2 text-base">
      <Eye aria-hidden className="mt-0.5 size-[1.05em] shrink-0 text-tx3" strokeWidth={2} />
      <p className="text-tx2">
        {hasNoAccess ? (
          <>
            <span className="font-medium text-tx">You no longer have access to this trip.</span>{' '}
            It may have been deleted, or your invite was withdrawn.
          </>
        ) : (
          <>
            <span className="font-medium text-tx">Read-only.</span>{' '}
            You were invited to this trip as a viewer — you can see everything, but only the
            owner and co-editors can change it.
          </>
        )}
      </p>
    </div>
  )
}
