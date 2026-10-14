'use client'
import { useConfirm } from '@/components/Confirm'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { shiftDepartures } from '@/lib/trips/timeline'
import type { Segment, Stay, TransportLeg } from '@/lib/trips/types'

// The edits Trip makes to the journey (round 3c): one place for the timeline,
// the stop page and the long-press menu, so a stop deleted from any of them
// asks the same question and does the same thing. Each delete answers whether
// it happened; the caller closes its sheet on true.
export function useTripEdits() {
  const mut = useTripMutation()
  const confirm = useConfirm()
  return {
    mut,
    saveStop: (seg: Segment, previous: Segment | null) =>
      mut.mutate((st) => ({
        ...st,
        segments: st.segments.some((x) => x.id === seg.id) ? st.segments.map((x) => (x.id === seg.id ? seg : x)) : [...st.segments, seg],
        // Moving Leave moves the leg after this stop with it (mock 15 §4).
        transport: previous ? shiftDepartures(st.transport, previous.city, previous.depart, seg.depart) : st.transport,
      })),
    deleteStop: async (seg: Segment) => {
      const ok = await confirm({
        title: seg.city ? `Delete ${seg.city}?` : 'Delete this stop?',
        body: 'Its stays and transport stay on the trip; the legs on either side become one.',
      })
      if (ok) mut.mutate((st) => ({ ...st, segments: st.segments.filter((x) => x.id !== seg.id) }))
      return ok
    },
    /** "Leave out of the plan" / "Put in the plan" from the menu: the one-tap edit, no form. */
    setInPlan: (seg: Segment, include: boolean) =>
      mut.mutate((st) => ({ ...st, segments: st.segments.map((x) => (x.id === seg.id ? { ...x, include } : x)) })),
    saveStay: (stay: Stay) =>
      mut.mutate((st) => ({
        ...st,
        stays: st.stays.some((x) => x.id === stay.id) ? st.stays.map((x) => (x.id === stay.id ? stay : x)) : [...st.stays, stay],
      })),
    deleteStay: async (id: string) => {
      const ok = await confirm({ title: 'Delete this stay?' })
      if (ok) mut.mutate((st) => ({ ...st, stays: st.stays.filter((x) => x.id !== id) }))
      return ok
    },
    saveLeg: (t: TransportLeg) =>
      mut.mutate((st) => ({
        ...st,
        transport: st.transport.some((x) => x.id === t.id) ? st.transport.map((x) => (x.id === t.id ? t : x)) : [...st.transport, t],
      })),
    removeLeg: async (id: string) => {
      const ok = await confirm({ title: 'Remove this transport?', confirmLabel: 'Remove' })
      if (ok) mut.mutate((st) => ({ ...st, transport: st.transport.filter((x) => x.id !== id) }))
      return ok
    },
  }
}
export type TripEdits = ReturnType<typeof useTripEdits>
