'use client'
import { createContext, useContext, useState } from 'react'
import { useTripScope } from '@/lib/trips/TripScope'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { useTripEvents } from '@/lib/trips/useTripEvents'
import { checkInCity, localISODate } from '@/lib/trips/whereAmI'
import { CheckInModal, type CheckInInput } from '@/app/(app)/live/CheckInModal'
import { FollowerNudge } from '@/app/(app)/live/FollowerNudge'

// The check-in sheet, mounted once above every screen.
//
// It used to belong to /live, so "Check in" had to be a NAVIGATION to /live —
// a screen that is Home a second time, with its own Check in button on it. The
// sheet lives here now and opens over whatever the traveller is looking at.
//
// COST CONTROL: useTripEvents runs the trip's event query, and this provider
// wraps every screen. So the hook is NOT called here — it is called inside
// <Sheet>, which is only mounted while the sheet is open. Money, Map and
// Settings pay nothing for the sheet being available.
//
// The nudge is the exception that has to live at this level: it appears AFTER
// a check-in is posted, by which time the sheet has unmounted and anything it
// was holding would be gone with it.

const CheckInCtx = createContext<{ open: () => void }>({ open: () => {} })

/** Open the check-in sheet from anywhere under the (app) layout. */
export const useCheckIn = () => useContext(CheckInCtx)

export function CheckInProvider({ children }: { children: React.ReactNode }) {
  const { tripId } = useTripScope()
  const [open, setOpen] = useState(false)
  const [nudge, setNudge] = useState(false)

  // NO ?checkin=1 SHIM HERE, deliberately. The brief version of this app
  // opened the sheet from that parameter, and the obvious thing was to keep
  // honouring it for installed apps holding the old URL. Two reasons not to:
  //
  //  - /live redirects to /dashboard and Next drops the query string, so the
  //    parameter never arrives at the screen that would read it. The shim
  //    would be dead code for the only case it was written for.
  //  - useSearchParams in a provider that wraps every screen needs a Suspense
  //    boundary the moment any page under this layout is statically rendered,
  //    and the build says so. Carrying that for dead code is a poor trade.
  //
  // A stale URL costs one extra tap, once.

  return (
    <CheckInCtx.Provider value={{ open: () => setOpen(true) }}>
      {children}
      {open && <Sheet onClose={() => setOpen(false)} onNudge={setNudge} />}
      {nudge && tripId && <FollowerNudge tripId={tripId} onClose={() => setNudge(false)} />}
    </CheckInCtx.Provider>
  )
}

function Sheet({ onClose, onNudge }: { onClose: () => void; onNudge: (v: boolean) => void }) {
  const { trip, cities } = useTripScreen()
  const { recentPlaces, online, saving, saveCheckIn, saveNote } = useTripEvents({ onNudge })
  const state = trip.data?.state
  // Computed here rather than at provider level: it needs today's date, and
  // this component only ever renders after a tap, long past hydration.
  const cityName = state ? checkInCity(state, localISODate()) : null

  const onSave = async (v: CheckInInput) => {
    if (await saveCheckIn(v)) onClose()
  }

  return (
    <CheckInModal
      cityName={cityName}
      cities={cities.data ?? []}
      recent={recentPlaces}
      online={online}
      saving={saving}
      onClose={onClose}
      onSave={onSave}
      onSaveNote={saveNote}
    />
  )
}
