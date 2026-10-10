#if DEBUG
import Foundation

/// Patrik and Petra's Asia as the follower mock has it (#166, 10 Oct): Bangkok, Hanoi,
/// Da Nang, with check-ins in the first two. From 13 Nov they have arrived in Da Nang.
/// `-followFixture YES`, with `-fixtureToday 2026-10-10` or `2026-11-13`.
enum FollowFixture {
    static let tripId = "f0110000-0000-4000-8000-000000000001"
    private static let patrik = Traveller(id: "f0110000-0000-4000-8000-0000000000a1", name: "Patrik")
    private static let petra = Traveller(id: "f0110000-0000-4000-8000-0000000000a2", name: "Petra")

    static func saved(today: String) -> FollowCache.Saved {
        let card = FollowedTripCard(trip_id: tripId, tripName: "Asia", startDate: "2026-09-01", endDate: "2027-04-30",
                                    state: "on", travellers: [patrik, petra], currentCity: nil, lastEventAt: nil)
        let summary = FollowedSummary(
            tripName: "Asia", startDate: "2026-09-01", endDate: "2027-04-30",
            route: [
                .init(city: "Bangkok", country: "Thailand", arrive: "2026-09-01", depart: "2026-09-30", lat: 13.7563, lng: 100.5018),
                .init(city: "Hanoi", country: "Vietnam", arrive: "2026-09-30", depart: "2026-11-13", lat: 21.0285, lng: 105.8542),
                .init(city: "Da Nang", country: "Vietnam", arrive: "2026-11-13", depart: "2027-01-10", lat: 16.0544, lng: 108.2022),
            ],
            legs: [
                .init(from: "Bangkok", to: "Hanoi", date: "2026-09-30", mode: "flight"),
                .init(from: "Hanoi", to: "Da Nang", date: "2026-11-13", mode: "train"),
            ],
            travellers: [patrik, petra])

        var feed: [FollowedEvent] = []
        func post(_ id: String, _ day: String, _ hour: Int, _ who: Traveller, _ place: String, _ stars: Int, _ text: String) {
            guard day <= today else { return }
            feed.append(FollowedEvent(id: id, kind: "checkin", occurred_at: "\(day)T\(String(format: "%02d", hour)):00:00Z",
                                      author: who.id, authorName: who.name,
                                      payload: .init(placeName: place), rating: stars, comment: text,
                                      trip_id: tripId, tripName: "Asia"))
        }
        post("f0110000-0000-4000-8000-0000000000c1", "2026-09-03", 9, patrik, "Chatuchak Market", 4, "Bring water, and cash for the snacks.")
        post("f0110000-0000-4000-8000-0000000000c2", "2026-09-06", 12, petra, "Jim Thompson House", 5, "The garden alone is worth it.")
        post("f0110000-0000-4000-8000-0000000000c3", "2026-09-09", 11, patrik, "Lumphini Park", 4, "Monitor lizards everywhere, and nobody minds.")
        post("f0110000-0000-4000-8000-0000000000c4", "2026-09-10", 13, petra, "Chinatown", 4, "Dinner on the street, twice.")
        post("f0110000-0000-4000-8000-0000000000c5", "2026-09-12", 3, petra, "Wat Pho", 4, "Go early, before the tour buses.")
        post("f0110000-0000-4000-8000-0000000000c6", "2026-10-02", 10, petra, "Hoan Kiem Lake", 5, "Walked round it twice before breakfast.")
        post("f0110000-0000-4000-8000-0000000000c7", "2026-10-05", 11, patrik, "Temple of Literature", 4, "Quiet inside, loud outside.")
        let yesterday = Days.add(min(today, "2026-11-12"), -1)
        post("f0110000-0000-4000-8000-0000000000c8", yesterday, 12, patrik, "Train Street", 5, "Rainy and perfect. The train came through at seven.")
        if today >= "2026-11-13" {
            feed.append(FollowedEvent(id: "f0110000-0000-4000-8000-0000000000e1", kind: "arrived",
                                      occurred_at: "2026-11-13T09:30:00Z", author: patrik.id, authorName: patrik.name,
                                      payload: .init(city: "Da Nang"), rating: nil, comment: nil,
                                      trip_id: tripId, tripName: "Asia"))
        }
        feed.sort { $0.at > $1.at }
        let counts = ["f0110000-0000-4000-8000-0000000000c5": 1, "f0110000-0000-4000-8000-0000000000c8": 2]
        return .init(cards: [card], feed: feed, summaries: [tripId: summary], counts: counts, muted: [])
    }

    static let comments: [String: [FollowComment]] = [
        "f0110000-0000-4000-8000-0000000000c5": [
            .init(id: "k1", parent_id: nil, author: "m", authorName: "Anna", isTraveller: false,
                  body: "We went at noon once. Never again!", deleted: false, created_at: "2026-09-12T08:00:00Z"),
        ],
        "f0110000-0000-4000-8000-0000000000c8": [
            .init(id: "k2", parent_id: nil, author: "m", authorName: "Anna", isTraveller: false,
                  body: "How close does it really get?", deleted: false, created_at: "2026-11-12T14:00:00Z"),
            .init(id: "k3", parent_id: "k2", author: patrik.id, authorName: "Patrik", isTraveller: true,
                  body: "Close enough to step back.", deleted: false, created_at: "2026-11-12T15:00:00Z"),
        ],
    ]
}
#endif
