import { redirect } from 'next/navigation'

// /live is retired. It was Home a second time: same title, same stay line, same
// progress bar, same "Next" row and the same full-width Check in button, so
// pressing Check in appeared to do nothing and landed the traveller on a
// rearranged copy of the screen they started on.
//
// Everything it had that Home did not has moved:
//   check-in sheet  → components/checkin/CheckInProvider (opens over any screen)
//   Note            → a mode of that sheet
//   Arrived         → Home, arrival day only, once
//   Plan vs actual  → components/trips/PlanVsActual, rendered on Home
//   edit / delete / queued → Home's feed rows (components/social/SocialRow)
//
// A REDIRECT, not a deletion, and it should stay one. Installed apps hold
// their last URL, service-worker shells cache documents by path, and phones
// carry bookmarks; a 404 would be the reward for having used the app before
// today. The folder keeps its name because CheckInModal, EditEventModal,
// FollowerNudge and Sheet still live in it and are imported from elsewhere.
export default function LivePage() {
  redirect('/dashboard')
}
