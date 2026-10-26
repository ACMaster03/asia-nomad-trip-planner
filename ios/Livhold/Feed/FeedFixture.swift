#if DEBUG
import Foundation

/// Asia from Patrik's side, as the Feed mock has it (round 2, 25 Oct): both travellers'
/// posts with what Mum, Anna and Bence left. With `-tripFixture YES`. Times count back
/// from now, so "New" always has something; photos are painted stand-ins ("fixture:…").
enum FeedFixture {
    static let tripId = "f0220000-0000-4000-8000-000000000001"
    /// Patrik is "you": the id the fixture signs in with (AppShell).
    private static let patrik = "fixture"
    private static let petra = "f0220000-0000-4000-8000-0000000000a2"
    private static let mum = "f0220000-0000-4000-8000-0000000000b1"
    private static let anna = "f0220000-0000-4000-8000-0000000000b2"
    private static let bence = "f0220000-0000-4000-8000-0000000000b3"

    static let followers: [Follower] = [
        .init(user_id: anna, name: "Anna", followedAt: "2026-09-03T10:00:00Z"),
        .init(user_id: bence, name: "Bence", followedAt: "2026-09-20T10:00:00Z"),
        .init(user_id: mum, name: "Mum", followedAt: "2026-08-28T10:00:00Z"),
    ]

    static func page(now: Date) -> JourneyFeedPage {
        func ago(_ hours: Double) -> String { ISO8601DateFormatter().string(from: now.addingTimeInterval(-hours * 3600)) }
        func post(_ id: String, _ hours: Double, kind: String = "checkin", _ who: String, place: String? = nil, city: String? = nil,
                  text: String? = nil, stars: Int? = nil, words: String? = nil, photos: [String] = [],
                  mine: String? = nil, comments: Int = 0, tally: [(String, Int)] = [], visibility: String = "followers") -> JourneyPost {
            JourneyPost(id: id, kind: kind, occurred_at: ago(hours), author: who, authorName: who == patrik ? "Patrik" : "Petra",
                        payload: .init(placeName: place, text: text, city: city, photos: photos), rating: stars, comment: words,
                        trip_id: tripId, visibility: visibility, mine: mine, commentCount: comments,
                        tally: tally.map { .init(kind: $0.0, count: $0.1) })
        }
        let posts = [
            post("p-c8", 26, patrik, place: "Train Street", stars: 5, words: "Rainy and perfect. The train came through at seven.",
                 photos: ["fixture:train", "fixture:train2"], comments: 2, tally: [("heart", 2), ("wow", 1)]),
            post("p-n1", 80, kind: "note", petra, text: "Ten days in and Hanoi finally feels like ours. We have a coffee place, and they know the order.",
                 comments: 4, tally: [("care", 2), ("heart", 1)]),
            post("p-c7", 120, patrik, place: "Temple of Literature", stars: 4, words: "Quiet inside, loud outside.",
                 photos: ["fixture:lit"], tally: [("clap", 1)]),
            post("p-c6", 190, petra, place: "Hoan Kiem Lake", stars: 5, words: "Walked round it twice before breakfast.",
                 photos: ["fixture:lake", "fixture:lake2", "fixture:lake3"], mine: "heart", comments: 1, tally: [("heart", 3)]),
            post("p-a1", 240, kind: "arrived", patrik, city: "Hanoi", tally: [("clap", 2), ("heart", 1)]),
            post("p-q1", 250, kind: "note", petra, text: "Last night in Bangkok. Packing for two takes four hours.", visibility: "trip"),
            post("p-c5", 670, petra, place: "Wat Pho", stars: 4, words: "Go early, before the tour buses.",
                 photos: ["fixture:wat"], mine: "heart", comments: 1, tally: [("heart", 2)]),
        ]
        func act(_ id: String, _ kind: String, _ post: String, _ who: String, _ name: String, _ hours: Double,
                 reaction: String? = nil, body: String? = nil) -> FeedActivity {
            let p = posts.first { $0.id == post }
            return FeedActivity(id: id, kind: kind, event_id: post, user_id: who, name: name, reaction: reaction, body: body,
                                parent_id: nil, at: ago(hours),
                                post: .init(kind: p?.kind, author: p?.author, authorName: p?.authorName,
                                            place: p?.payload?.placeName ?? (p?.kind == "arrived" ? p?.payload?.city : nil)))
        }
        let activity = [
            act("x1", "reaction", "p-c8", mum, "Mum", 2, reaction: "heart"),
            act("fc1", "comment", "p-c8", anna, "Anna", 3, body: "How close does it really get?"),
            act("x3", "reaction", "p-c7", bence, "Bence", 22, reaction: "clap"),
            act("x4", "reaction", "p-n1", mum, "Mum", 24, reaction: "care"),
            act("fc6", "comment", "p-n1", bence, "Bence", 60, body: "Jealous."),
        ]
        return JourneyFeedPage(posts: posts, activity: activity)
    }

    static let comments: [String: [FollowComment]] = [
        "p-c8": [
            .init(id: "fc1", parent_id: nil, author: anna, authorName: "Anna", isTraveller: false,
                  body: "How close does it really get?", deleted: false, created_at: ISO8601DateFormatter().string(from: FollowDates.now.addingTimeInterval(-3 * 3600))),
            .init(id: "fc2", parent_id: "fc1", author: patrik, authorName: "Patrik", isTraveller: true,
                  body: "Close enough to step back.", deleted: false, created_at: ISO8601DateFormatter().string(from: FollowDates.now.addingTimeInterval(-2 * 3600))),
        ],
        "p-n1": [
            .init(id: "fc3", parent_id: nil, author: mum, authorName: "Mum", isTraveller: false,
                  body: "This made my day.", deleted: false, created_at: "2026-10-07T09:00:00Z"),
            .init(id: "fc4", parent_id: nil, author: anna, authorName: "Anna", isTraveller: false,
                  body: "Which coffee place?", deleted: false, created_at: "2026-10-07T10:00:00Z"),
            .init(id: "fc5", parent_id: "fc4", author: petra, authorName: "Petra", isTraveller: true,
                  body: "Cong, the one by the lake!", deleted: false, created_at: "2026-10-07T11:00:00Z"),
            .init(id: "fc6", parent_id: nil, author: bence, authorName: "Bence", isTraveller: false,
                  body: "Jealous.", deleted: false, created_at: "2026-10-08T09:00:00Z"),
        ],
    ]

    static let reactors: [String: [Reactor]] = [
        "p-c8": [.init(user_id: mum, name: "Mum", kind: "heart"), .init(user_id: bence, name: "Bence", kind: "wow"),
                 .init(user_id: anna, name: "Anna", kind: "heart")],
        "p-n1": [.init(user_id: mum, name: "Mum", kind: "care"), .init(user_id: anna, name: "Anna", kind: "care"),
                 .init(user_id: bence, name: "Bence", kind: "heart")],
        "p-c7": [.init(user_id: bence, name: "Bence", kind: "clap")],
        "p-c6": [.init(user_id: patrik, name: "Patrik", kind: "heart"), .init(user_id: mum, name: "Mum", kind: "heart"),
                 .init(user_id: anna, name: "Anna", kind: "heart")],
        "p-a1": [.init(user_id: mum, name: "Mum", kind: "clap"), .init(user_id: anna, name: "Anna", kind: "clap"),
                 .init(user_id: bence, name: "Bence", kind: "heart")],
        "p-c5": [.init(user_id: patrik, name: "Patrik", kind: "heart"), .init(user_id: anna, name: "Anna", kind: "heart")],
    ]
}
#endif
