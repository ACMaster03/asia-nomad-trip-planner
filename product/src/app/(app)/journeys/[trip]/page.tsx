import JourneyClient from './JourneyClient'

// A followed person's trip, as their follower sees it. Auth comes from the
// (app) layout; whether THIS caller may see this trip is decided by
// followed_trip_summary (null = you follow nobody on it).
export default async function JourneyPage({ params }: { params: Promise<{ trip: string }> }) {
  const { trip } = await params
  return <JourneyClient tripId={trip} />
}
