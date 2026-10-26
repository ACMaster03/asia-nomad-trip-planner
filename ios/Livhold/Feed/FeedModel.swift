import Foundation

// The traveller's own side of the feed (#130; Petra, 25 Oct): your journey's posts with
// what your followers left on them, from `journey_feed` (migration 48). The reactions
// are the six of 34 (`reaction_kinds`); only travellers get the counts and the names.

enum ReactionKind: String, CaseIterable, Codable, Identifiable, Sendable {
    case heart, laugh, wow, clap, fire, care
    var id: Self { self }

    var glyph: String {
        switch self {
        case .heart: "❤️"
        case .laugh: "😂"
        case .wow: "😮"
        case .clap: "👏"
        case .fire: "🔥"
        case .care: "🥹"
        }
    }

    /// What each one says, as the web's picker labels them.
    var label: String {
        switch self {
        case .heart: String(localized: "beautiful")
        case .laugh: String(localized: "funny")
        case .wow: String(localized: "astonishing")
        case .clap: String(localized: "milestone")
        case .fire: String(localized: "the grind")
        case .care: String(localized: "affection")
        }
    }
}

/// One post of your journey, as `journey_feed` sends it: the follower feed's fields plus
/// who may see it, your own reaction, the comment count and the tally.
struct JourneyPost: Codable, Hashable, Identifiable, Sendable {
    struct Count: Codable, Hashable, Sendable {
        let kind: String
        let count: Int
    }

    let id: String
    let kind: String
    let occurred_at: String
    let author: String?
    let authorName: String?
    let payload: FollowedEvent.Payload?
    let rating: Int?
    let comment: String?
    let trip_id: String
    /// trip (travellers only), followers or public.
    let visibility: String?
    var mine: String?
    var commentCount: Int?
    var tally: [Count]?

    var event: FollowedEvent {
        FollowedEvent(id: id, kind: kind, occurred_at: occurred_at, author: author, authorName: authorName,
                      payload: payload, rating: rating, comment: comment, trip_id: trip_id, tripName: nil)
    }

    var at: Date { FollowDates.instant(occurred_at) ?? .distantPast }
    var day: String { FollowDates.day(at) }
    var onlyTravellers: Bool { visibility == "trip" }
    var reactionCount: Int { (tally ?? []).reduce(0) { $0 + $1.count } }
}

/// Someone reacted or commented on one of the journey's posts.
struct FeedActivity: Codable, Hashable, Identifiable, Sendable {
    struct Post: Codable, Hashable, Sendable {
        let kind: String?
        let author: String?
        let authorName: String?
        /// The check-in's place or the arrival's city; nil for a note.
        let place: String?
    }

    let id: String
    /// reaction or comment.
    let kind: String
    let event_id: String
    let user_id: String
    let name: String?
    let reaction: String?
    let body: String?
    let parent_id: String?
    let at: String
    let post: Post?

    var isComment: Bool { kind == "comment" }
    var date: Date { FollowDates.instant(at) ?? .distantPast }
    var glyph: String { reaction.flatMap(ReactionKind.init(rawValue:))?.glyph ?? "" }
}

/// `journey_feed`'s answer.
struct JourneyFeedPage: Codable, Sendable {
    var posts: [JourneyPost]
    var activity: [FeedActivity]
}

/// Someone who follows you (`my_followers`).
struct Follower: Codable, Hashable, Identifiable, Sendable {
    let user_id: String
    let name: String
    let followedAt: String?
    var id: String { user_id }
}

/// Who reacted with what on one post (`event_reactors`, travellers only).
struct Reactor: Codable, Hashable, Identifiable, Sendable {
    let user_id: String
    let name: String
    let kind: String
    var id: String { user_id }
}
