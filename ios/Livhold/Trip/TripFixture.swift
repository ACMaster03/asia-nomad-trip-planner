#if DEBUG
import Foundation

/// The web's dev fixture (product/src/app/dev/trip-preview + money-preview), so the
/// iOS Trip screen can be checked against /dev/trip-preview without a real journey.
/// Launch with `-tripFixture YES` to use it. Debug builds only.
///
/// What it exercises (mock 15): a booked flight with a connection, an idea flight
/// with no price, a Da Nang stay that leaves a gap ("No bed"), an old option that
/// never counted, legs with nothing yet, and a flight to a city that is not a stop.
enum TripFixture {
    static func trip(today: String) -> TripRow {
        let state = TripState(
            meta: TripMeta(tripName: "Asia", baseCurrency: "HUF", budgetCap: 4_500_000,
                           startDate: "2026-08-31", endDate: "2027-04-30", homeBase: "Budapest"),
            rates: ["HUF": 1, "THB": 10, "USD": 340, "VND": 0.013],
            segments: [
                Segment(id: "bkk", country: "Thailand", city: "Bangkok", arrive: "2026-09-01", depart: "2026-09-30"),
                Segment(id: "han", country: "Vietnam", city: "Hanoi", arrive: "2026-09-30", depart: "2026-11-13"),
                Segment(id: "dad", country: "Vietnam", city: "Da Nang", arrive: "2026-11-13", depart: "2026-12-13"),
            ],
            stays: [
                Stay(id: "st1", segId: "bkk", name: "Home in Khet Huai Khwang", platform: "Booking.com", cur: "USD",
                     ppn: 33.71, nights: 29, status: "chosen", include: true, chargeDate: "2026-07-09"),
                Stay(id: "st2", segId: "han", name: "Văn Giang (Mai Kenny)", platform: "Airbnb", cur: "USD",
                     ppn: 29, status: "chosen", include: true, chargeDate: "2026-09-29"),
                Stay(id: "st3", segId: "dad", name: "An Bang beach house", platform: "Airbnb", cur: "USD",
                     ppn: 41, status: "booked", include: true, chargeDate: "2026-11-13",
                     checkIn: "2026-11-13", checkOut: "2026-11-30", chargeAtCheckIn: true),
                Stay(id: "st4", segId: "dad", name: "Hoi An old town loft", platform: "Airbnb", cur: "USD",
                     ppn: 38, status: "shortlist", include: false),
            ],
            transport: [
                TransportLeg(id: "t1", type: "flight", from: "Budapest", to: "Bangkok", date: "2026-08-31", cur: "HUF",
                             price: 248_000, status: "booked", chargeDate: "2026-07-09", time: "13:20", via: "Shanghai", hours: 14.58),
                TransportLeg(id: "t2", type: "flight", from: "Bangkok", to: "Hanoi", date: "2026-09-30", cur: "USD",
                             price: 0, status: "idea"),
                TransportLeg(id: "t3", type: "flight", from: "Da Nang", to: "Hong Kong", date: "2026-12-13", cur: "USD",
                             price: 258, status: "booked", chargeDate: "2026-09-15"),
            ]
        )
        return TripRow(id: "fixture", owner: nil, name: "Asia", state: state, updatedAt: nil, stateRev: 0)
    }
}
#endif
