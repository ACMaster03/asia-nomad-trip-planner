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
        // Through JSON, so the fixture has a raw document that edits can change.
        var raw = (try? JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(state))) ?? .object([:])
        raw["subscriptions"] = .array(subscriptions.map { s in
            var o: [String: JSONValue] = ["id": .string(s.0), "label": .string(s.1), "cur": .string("HUF"),
                                          "amount": .number(s.2), "everyMonths": .number(Double(s.3)), "anchor": .string(s.4)]
            if let c = s.5 { o["cancelledOn"] = .string(c) }
            return .object(o)
        })
        // Home's reminder card: one overdue, one due this week, one before departure, one done.
        raw["reminders"] = .array([
            .object(["id": .string("r-visa"), "title": .string("Extend the Vietnam visa"), "due": .string(Days.add(today, -2))]),
            .object(["id": .string("r-sim"), "title": .string("Top up the SIM card"), "due": .string(Days.add(today, 4))]),
            .object(["id": .string("r-ins"), "title": .string("Travel insurance"), "due": .string("2026-08-25")]),
            .object(["id": .string("r-done"), "title": .string("Book the Hanoi flat"), "due": .string("2026-09-01"),
                     "doneOn": .string("2026-08-30")]),
        ])
        let ledger = entries(today: today).map { e -> LedgerEntry in
            var o: [String: JSONValue] = ["id": .string(e.id), "date": .string(e.date), "type": .string(e.income ? "income" : "expense"),
                                          "category": .string(e.cat), "amount": .number(e.amount), "currency": .string(e.cur), "note": .string(e.note)]
            if let s = e.source { o["source"] = .object(["kind": .string(s.0), "id": .string(s.1)]) }
            if let d = e.everyday { o["everyday"] = .bool(d) }
            return LedgerEntry(raw: .object(o))
        }
        // Made before departure, like Asia: a journey from before Money round 2 keeps every card.
        return try! TripRow(id: "fixture", owner: nil, name: "Asia", rawState: raw, updatedAt: nil, stateRev: 0,
                            ledger: ledger, ledgerRev: 0, createdAt: "2026-08-10T09:00:00.000Z")
    }

    /// Bangkok, Hanoi and Da Nang as the catalogue has them (USD).
    static let cities: [String: CityCost] = [
        "Bangkok": CityCost(accom: [20, 40, 90], live: [18, 30, 55]),
        "Hanoi": CityCost(accom: [15, 30, 70], live: [15, 25, 45]),
        "Da Nang": CityCost(accom: [18, 35, 80], live: [16, 27, 50]),
    ]

    private static let subscriptions: [(String, String, Double, Int, String, String?)] = [
        ("sub-icloud", "iCloud 2 TB", 3290, 1, "2026-08-14", nil),
        ("sub-spotify", "Spotify Duo", 2490, 1, "2026-08-17", nil),
        ("sub-net", "Home internet · Budapest flat", 7990, 1, "2026-08-23", nil),
        ("sub-domain", "Domain + hosting", 18_000, 12, "2025-11-12", nil),
        ("sub-netflix", "Netflix", 4490, 1, "2026-08-20", "2026-09-06"),
    ]

    private struct E {
        let id, date, cat: String
        let amount: Double
        let cur, note: String
        var source: (String, String)? = nil
        var everyday: Bool? = nil
        var income = false
    }

    /// The web's money-preview ledger (product/src/app/dev/money-preview/fixture.ts).
    private static func entries(today: String) -> [E] {
        [
            E(id: "imp-st1", date: "2026-07-09", cat: "stays", amount: 977.59, cur: "USD", note: "Bangkok - Home in Khet Huai Khwang", source: ("stay", "st1")),
            E(id: "le-plan-extra-x1", date: "2026-08-12", cat: "insurance", amount: 340_000, cur: "HUF", note: "Insurance · 2 pax, 6 months"),
            E(id: "le-plan-extra-x3", date: "2026-08-20", cat: "insurance", amount: 84_000, cur: "HUF", note: "Visas · TH ext, VN e-visa ×2"),
            E(id: "g1", date: "2026-08-20", cat: "gear", amount: 64_900, cur: "HUF", note: "Osprey backpack"),
            E(id: "g2", date: "2026-08-30", cat: "connectivity", amount: 10.99, cur: "USD", note: "Saily E-sim 10 GB"),
            E(id: "imp-t1", date: "2026-08-31", cat: "transport", amount: 248_000, cur: "HUF", note: "flight Budapest → Bangkok", source: ("transport", "t1")),
            E(id: "a1", date: "2026-08-31", cat: "food", amount: 35_100, cur: "HUF", note: "Airport (food, drinks)"),
            E(id: "s1", date: "2026-09-01", cat: "groceries", amount: 5_943, cur: "HUF", note: "Toilet paper, milk, water, kimchi, toast"),
            E(id: "s1b", date: "2026-09-01", cat: "local-transport", amount: 300, cur: "THB", note: "Grab from the airport"),
            E(id: "s2a", date: "2026-09-02", cat: "drinks", amount: 170, cur: "THB", note: "Iced coffees"),
            E(id: "s2b", date: "2026-09-02", cat: "clothes", amount: 200, cur: "THB", note: "T-shirt"),
            E(id: "s2c", date: "2026-09-02", cat: "clothes", amount: 880, cur: "THB", note: "Pants"),
            E(id: "s2d", date: "2026-09-02", cat: "food", amount: 1050, cur: "THB", note: "Japanese restaurant"),
            E(id: "s2e", date: "2026-09-02", cat: "food", amount: 130, cur: "THB", note: "2 meals"),
            E(id: "s2f", date: "2026-09-02", cat: "convenience", amount: 635.5, cur: "THB", note: "Snacks, tea, beer"),
            E(id: "s2g", date: "2026-09-02", cat: "personal-care", amount: 1284, cur: "THB", note: "Watsons"),
            E(id: "s3a", date: "2026-09-03", cat: "food", amount: 320, cur: "THB", note: "Breakfast meals"),
            E(id: "s3b", date: "2026-09-03", cat: "personal-care", amount: 1104, cur: "THB", note: "Face care"),
            E(id: "s3c", date: "2026-09-03", cat: "food", amount: 300, cur: "THB", note: "4 big meals"),
            E(id: "s3d", date: "2026-09-03", cat: "clothes", amount: 120, cur: "THB", note: "Elephant pants"),
            E(id: "s3e", date: "2026-09-03", cat: "accessories", amount: 239, cur: "THB", note: "Phone strap"),
            E(id: "s3f", date: "2026-09-03", cat: "activities", amount: 90_000, cur: "HUF", note: "Concert tickets", everyday: false),
            E(id: "s4a", date: "2026-09-04", cat: "souvenirs", amount: 20, cur: "THB", note: "Postcard from the grand palace"),
            E(id: "s4b", date: "2026-09-04", cat: "local-transport", amount: 200, cur: "THB", note: "Tuk-tuk"),
            E(id: "s4c", date: "2026-09-04", cat: "activities", amount: 600, cur: "THB", note: "Reclining Buddha"),
            E(id: "s4d", date: "2026-09-04", cat: "food", amount: 160, cur: "THB", note: "4 pieces of bao"),
            E(id: "s4e", date: "2026-09-04", cat: "fees", amount: 220, cur: "THB", note: "ATM fee"),
            E(id: "s5a", date: "2026-09-05", cat: "drinks", amount: 160, cur: "THB", note: "Thai tea, juices"),
            E(id: "s5b", date: "2026-09-05", cat: "health", amount: 500, cur: "THB", note: "Massage"),
            E(id: "s5c", date: "2026-09-05", cat: "clothes", amount: 380, cur: "THB", note: "Pants, scarf"),
            E(id: "s5d", date: "2026-09-05", cat: "food", amount: 440, cur: "THB", note: "4 meals, mango sticky rice"),
            E(id: "s5e", date: "2026-09-05", cat: "accessories", amount: 200, cur: "THB", note: "Sunglasses"),
            E(id: "s7a", date: "2026-09-07", cat: "food", amount: 520, cur: "THB", note: "Street food night"),
            E(id: "s7b", date: "2026-09-07", cat: "local-transport", amount: 90, cur: "THB", note: "BTS"),
            E(id: "s9a", date: "2026-09-09", cat: "health", amount: 500, cur: "THB", note: "Massage"),
            E(id: "s9b", date: "2026-09-09", cat: "food", amount: 320, cur: "THB", note: "4 meals"),
            E(id: "s10a", date: "2026-09-10", cat: "food", amount: 160, cur: "THB", note: "Bao (4)"),
            E(id: "s10b", date: "2026-09-10", cat: "local-transport", amount: 170, cur: "THB", note: "Tuk-tuk to the palace"),
            E(id: "s11a", date: "2026-09-11", cat: "drinks", amount: 170, cur: "THB", note: "Iced coffees"),
            E(id: "s12a", date: "2026-09-12", cat: "food", amount: 410, cur: "THB", note: "Dinner by the river"),
            E(id: "sub-1", date: "2026-09-14", cat: "subscriptions", amount: 3290, cur: "HUF", note: "iCloud 2 TB"),
            E(id: "s13a", date: today, cat: "convenience", amount: 95, cur: "THB", note: "7-Eleven breakfast"),
            E(id: "imp-st2", date: "2026-09-29", cat: "stays", amount: 1276, cur: "USD", note: "Văn Giang (Mai Kenny)", source: ("stay", "st2")),
            E(id: "inc1", date: "2026-09-01", cat: "freelance", amount: 420_000, cur: "HUF", note: "August invoice", income: true),
        ]
    }
}
#endif
