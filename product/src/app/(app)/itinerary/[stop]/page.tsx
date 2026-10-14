import { redirect } from 'next/navigation'

// The stop page was a route of its own for an hour on 14 Oct (#199); it is a
// layer over the timeline now, at /itinerary?stop=<id>, so it opens without a
// trip to the server. A link from then still lands on the stop.
export default async function StopRoute({ params }: { params: Promise<{ stop: string }> }) {
  const { stop } = await params
  redirect(`/itinerary?stop=${encodeURIComponent(stop)}`)
}
