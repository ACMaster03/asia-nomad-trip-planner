import Foundation
import Observation
import Supabase

/// The journeys of the people you follow, local-first like your own journey: the copy
/// saved on the phone shows at once, the server's follows. Home lists them (#130) and
/// a card opens one as a read-only Trip (#166).
@MainActor
@Observable
final class FollowStore {
    /// Every followed journey, one entry per journey even when you follow both travellers.
    private(set) var cards: [FollowedTripCard] = []
    /// The feed across all of them, newest first.
    private(set) var feed: [FollowedEvent] = []
    private(set) var summaries: [String: FollowedSummary] = [:]
    /// Comment counts by post.
    private(set) var commentCounts: [String: Int] = [:]
    /// Journeys muted on this account (`trip_notify.muted`).
    private(set) var muted: Set<String> = []
    /// The list loaded at least once (from the server or the saved copy).
    private(set) var loaded = false
    private(set) var failed = false

    let client: SupabaseClient
    private var userId: String?
    private var refreshing = false

    init(client: SupabaseClient = Backend.client) {
        self.client = client
    }

    /// `-followFixture YES` (debug): Patrik and Petra's Asia as the follower mock has it,
    /// with no network.
    static var usesFixture: Bool {
        #if DEBUG
        UserDefaults.standard.bool(forKey: "followFixture")
        #else
        false
        #endif
    }

    var hasAny: Bool { !cards.isEmpty }

    func journey(_ tripId: String) -> FollowedJourney? {
        guard let s = summaries[tripId] else { return nil }
        return FollowedJourney(tripId: tripId, summary: s, events: feed)
    }

    /// The followed journeys for Home: live ones first, then those still to come, then
    /// the finished ones, newest first.
    func journeys(today: String) -> [(card: FollowedTripCard, journey: FollowedJourney?)] {
        cards.map { ($0, journey($0.trip_id)) }.sorted { a, b in
            let ra = Self.rank(a.card, today), rb = Self.rank(b.card, today)
            if ra != rb { return ra < rb }
            return (a.card.startDate ?? "") > (b.card.startDate ?? "")
        }
    }

    private static func rank(_ c: FollowedTripCard, _ today: String) -> Int {
        if c.paused { return 3 }
        let start = c.startDate ?? "", end = c.endDate ?? ""
        if !start.isEmpty, start <= today, end.isEmpty || today <= end { return 0 }
        if start > today { return 1 }
        return 2
    }

    /// Whether any followed journey is under way today.
    func anyLive(today: String) -> Bool {
        cards.contains { Self.rank($0, today) == 0 }
    }

    // MARK: loading

    func start(userId: String) async {
        guard self.userId != userId || !loaded else { return }
        self.userId = userId
        if Self.usesFixture {
            #if DEBUG
            apply(FollowFixture.saved(today: Days.today()))
            loaded = true
            #endif
            return
        }
        if let saved = FollowCache.load(userId: userId) { apply(saved); loaded = true }
        await refresh()
    }

    func refresh() async {
        guard let userId, !refreshing, !Self.usesFixture else { return }
        refreshing = true
        defer { refreshing = false }
        do {
            try await Connectivity.shared.waitUntilOnline()
            let people: [FollowedPerson] = try await client.rpc("my_following").execute().value
            var seen = Set<String>()
            let cards = people.flatMap(\.trips).filter { seen.insert($0.trip_id).inserted }
            var feed: [FollowedEvent] = []
            var summaries: [String: FollowedSummary] = [:]
            if !cards.isEmpty {
                feed = try await fetchFeed()
                try await withThrowingTaskGroup(of: (String, FollowedSummary?).self) { group in
                    for c in cards where !c.paused {
                        group.addTask { [client] in
                            let s: FollowedSummary? = try await client
                                .rpc("followed_trip_summary", params: ["p_trip": c.trip_id]).execute().value
                            return (c.trip_id, s)
                        }
                    }
                    for try await (id, s) in group { if let s { summaries[id] = s } }
                }
                for c in cards where c.paused {
                    summaries[c.trip_id] = FollowedSummary(tripName: c.tripName, paused: true)
                }
            }
            let saved = FollowCache.Saved(cards: cards, feed: feed, summaries: summaries,
                                          counts: await fetchCounts(feed), muted: await fetchMuted())
            apply(saved)
            loaded = true
            failed = false
            FollowCache.save(saved, userId: userId)
        } catch is CancellationError {
            return
        } catch {
            if !loaded { failed = true }
        }
    }

    /// Up to 150 posts across every followed journey: enough for each stop's check-ins
    /// on a long journey, in pages of 50 (the server's cap).
    private func fetchFeed() async throws -> [FollowedEvent] {
        struct Params: Encodable, Sendable { let p_limit: Int; let p_before: String? }
        var out: [FollowedEvent] = []
        var before: String?
        for _ in 0..<3 {
            let page: [FollowedEvent] = try await client
                .rpc("following_feed", params: Params(p_limit: 50, p_before: before)).execute().value
            out += page
            guard page.count == 50, let last = page.last else { break }
            before = last.occurred_at
        }
        return out
    }

    private func fetchCounts(_ feed: [FollowedEvent]) async -> [String: Int] {
        struct Row: Decodable { let event_id: String; let commentCount: Int? }
        var out: [String: Int] = [:]
        let ids = feed.filter(\.isCheckIn).map(\.id)
        for chunk in stride(from: 0, to: ids.count, by: 100).map({ Array(ids[$0..<min($0 + 100, ids.count)]) }) {
            guard let rows: [Row] = try? await client.rpc("feed_social", params: ["p_events": chunk]).execute().value
            else { continue }
            for r in rows { out[r.event_id] = r.commentCount ?? 0 }
        }
        return out
    }

    private func fetchMuted() async -> Set<String> {
        struct Row: Decodable { let trip_id: String; let muted: Bool }
        let rows: [Row] = (try? await client.from("trip_notify").select("trip_id,muted").execute().value) ?? []
        return Set(rows.filter(\.muted).map(\.trip_id))
    }

    private func apply(_ s: FollowCache.Saved) {
        cards = s.cards
        feed = s.feed
        summaries = s.summaries
        commentCounts = s.counts
        muted = s.muted
    }

    private func persist() {
        guard let userId, !Self.usesFixture else { return }
        FollowCache.save(.init(cards: cards, feed: feed, summaries: summaries, counts: commentCounts, muted: muted), userId: userId)
    }

    // MARK: mute

    /// No notifications from this journey, on any channel (37's per-trip mute).
    func setMuted(_ on: Bool, tripId: String) async throws {
        let before = muted
        if on { muted.insert(tripId) } else { muted.remove(tripId) }
        guard let userId, !Self.usesFixture else { return }
        struct Row: Encodable, Sendable { let user_id: String; let trip_id: String; let muted: Bool }
        do {
            try await Connectivity.shared.waitUntilOnline()
            // all_comments keeps its default on a new row and its value on an old one.
            try await client.from("trip_notify")
                .upsert(Row(user_id: userId, trip_id: tripId, muted: on), onConflict: "user_id,trip_id")
                .execute()
            persist()
        } catch {
            muted = before
            throw error
        }
    }

    // MARK: comments

    func comments(_ eventId: String) async throws -> [FollowComment] {
        if Self.usesFixture {
            #if DEBUG
            return FollowFixture.comments[eventId] ?? []
            #else
            return []
            #endif
        }
        try await Connectivity.shared.waitUntilOnline()
        let list: [FollowComment]? = try await client.rpc("event_comments_list", params: ["p_event": eventId]).execute().value
        let live = (list ?? []).filter { $0.deleted != true }
        commentCounts[eventId] = live.count
        return list ?? []
    }

    func addComment(_ body: String, to eventId: String) async throws -> FollowComment? {
        let text = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        if Self.usesFixture {
            commentCounts[eventId, default: 0] += 1
            return FollowComment(id: UUID().uuidString, parent_id: nil, author: "fixture", authorName: String(localized: "You"),
                                 isTraveller: false, body: text, deleted: false, created_at: ISO8601DateFormatter().string(from: .now))
        }
        struct Params: Encodable, Sendable { let p_event: String; let p_body: String }
        try await Connectivity.shared.waitUntilOnline()
        let c: FollowComment? = try await TripStore.oneMoreTry {
            try await client.rpc("add_comment", params: Params(p_event: eventId, p_body: text)).execute().value
        }
        commentCounts[eventId, default: 0] += 1
        persist()
        return c
    }
}

/// The follower side saved on the phone, per account, for a start with no signal.
enum FollowCache {
    struct Saved: Codable {
        var cards: [FollowedTripCard]
        var feed: [FollowedEvent]
        var summaries: [String: FollowedSummary]
        var counts: [String: Int]
        var muted: Set<String>
    }

    private static func url(userId: String) -> URL? {
        guard let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        // Inside "Trips", so signing out (TripCache.clearAll) removes it too.
        let folder = dir.appending(path: "Trips", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder.appending(path: "following-\(userId).json")
    }

    static func save(_ s: Saved, userId: String) {
        guard let url = url(userId: userId), let data = try? JSONEncoder().encode(s) else { return }
        try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    static func load(userId: String) -> Saved? {
        guard let url = url(userId: userId), let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Saved.self, from: data)
    }
}

/// When a follower last saw each journey's latest arrival: an arrival plays once per
/// phone, on the next look (4 Oct).
enum ArrivalSeen {
    private static func key(_ tripId: String) -> String { "follow.arrival.\(tripId)" }
    static func seen(_ eventId: String, tripId: String) -> Bool {
        UserDefaults.standard.string(forKey: key(tripId)) == eventId
    }
    static func mark(_ eventId: String, tripId: String) {
        UserDefaults.standard.set(eventId, forKey: key(tripId))
    }
}
