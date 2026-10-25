import Foundation
import Observation
import Supabase

/// The Feed tab's data (#130; Petra, 25 Oct): your journey's posts, what people left on
/// them, and who follows you. Local-first like the rest: the saved copy shows at once,
/// `journey_feed` (48) follows. When you last looked is kept on the phone, per journey.
@MainActor
@Observable
final class JourneyFeedStore {
    private(set) var posts: [JourneyPost] = []
    /// Reactions and comments by others, newest first (the server's 40 newest).
    private(set) var activity: [FeedActivity] = []
    private(set) var followers: [Follower] = []
    private(set) var loaded = false
    private(set) var failed = false
    private(set) var hasOlder = false
    /// The rows that were new when the tab was last opened: "New" shows these for the
    /// whole visit, though they count as seen from the moment it opened.
    private(set) var shownNew: [FeedActivity] = []
    /// Why a reaction didn't save; the screen shows it once.
    var notice: String?

    let client: SupabaseClient
    private(set) var tripId: String?
    private var userId: String?
    private var refreshing = false
    private var seenAt: Date = .distantPast
    /// Reactions sent and not answered yet, by post: a refresh landing meanwhile keeps them.
    private var pending: [String: String?] = [:]

    init(client: SupabaseClient = Backend.client) {
        self.client = client
    }

    private static let pageSize = 30

    /// Activity newer than the last look: the number on the tab.
    var newCount: Int { activity.filter { $0.date > seenAt }.count }

    // MARK: loading

    func start(tripId: String?, userId: String) async {
        guard tripId != self.tripId || userId != self.userId else { return }
        self.tripId = tripId
        self.userId = userId
        posts = []; activity = []; followers = []; shownNew = []; loaded = false; failed = false
        guard let tripId else { return }
        seenAt = FeedSeen.at(tripId)
        if TripStore.isFixture {
            #if DEBUG
            let f = FeedFixture.page(now: FollowDates.now)
            posts = f.posts
            activity = f.activity
            followers = FeedFixture.followers
            seenAt = .distantPast
            loaded = true
            #endif
            return
        }
        if let saved = FeedCache.load(tripId: tripId) {
            posts = saved.page.posts
            activity = saved.page.activity
            followers = saved.followers
            hasOlder = posts.count >= Self.pageSize
            loaded = true
        }
        await refresh()
    }

    func refresh() async {
        guard let tripId, !refreshing, !TripStore.isFixture else { return }
        refreshing = true
        defer { refreshing = false }
        do {
            try await Connectivity.shared.waitUntilOnline()
            async let people = fetchFollowers()
            let page = try await fetch(before: nil)
            guard tripId == self.tripId else { return }
            posts = keepingPending(page.posts)
            activity = page.activity
            followers = await people
            hasOlder = page.posts.count >= Self.pageSize
            loaded = true
            failed = false
            FeedCache.save(.init(page: page, followers: followers), tripId: tripId)
        } catch is CancellationError {
            return
        } catch {
            if !loaded { failed = true }
        }
    }

    /// The next page of older posts.
    func loadOlder() async {
        guard let last = posts.last, hasOlder, !TripStore.isFixture else { return }
        guard let page = try? await fetch(before: last.occurred_at) else { return }
        let known = Set(posts.map(\.id))
        posts += page.posts.filter { !known.contains($0.id) }
        hasOlder = page.posts.count >= Self.pageSize
    }

    private func fetch(before: String?) async throws -> JourneyFeedPage {
        struct Params: Encodable, Sendable { let p_trip: String; let p_limit: Int; let p_before: String? }
        let page: JourneyFeedPage? = try await client
            .rpc("journey_feed", params: Params(p_trip: tripId ?? "", p_limit: Self.pageSize, p_before: before))
            .execute().value
        return page ?? JourneyFeedPage(posts: [], activity: [])
    }

    private func fetchFollowers() async -> [Follower] {
        (try? await client.rpc("my_followers").execute().value) ?? followers
    }

    private func keepingPending(_ list: [JourneyPost]) -> [JourneyPost] {
        list.map { p in
            guard let kind = pending[p.id] else { return p }
            return Self.reacting(p, kind)
        }
    }

    // MARK: seen

    /// The tab was opened (or refreshed while open): what is new stays listed for this
    /// visit, and stops counting.
    func opened() {
        guard let tripId else { return }
        let fresh = activity.filter { $0.date > seenAt }
        let known = Set(fresh.map(\.id))
        shownNew = (fresh + shownNew.filter { !known.contains($0.id) }).sorted { $0.date > $1.date }
        let newest = activity.first?.date ?? .now
        seenAt = max(seenAt, newest)
        if !TripStore.isFixture { FeedSeen.mark(seenAt, tripId: tripId) }
    }

    /// The tab was left: next time "New" starts from what came since.
    func left() { shownNew = [] }

    // MARK: reactions

    /// Optimistic: the post changes at once, the server follows; a refusal puts it back.
    func react(_ postId: String, _ kind: ReactionKind?) {
        guard let i = posts.firstIndex(where: { $0.id == postId }) else { return }
        let before = posts[i]
        guard before.mine != kind?.rawValue else { return }
        posts[i] = Self.reacting(before, kind?.rawValue)
        if TripStore.isFixture { return }
        pending[postId] = kind?.rawValue
        Task {
            do {
                let row = try await Reactions.send(postId, kind, client: client)
                pending[postId] = nil
                if let j = posts.firstIndex(where: { $0.id == postId }), let row {
                    posts[j].mine = row.mine
                    posts[j].tally = row.tally ?? posts[j].tally
                    posts[j].commentCount = row.commentCount ?? posts[j].commentCount
                }
            } catch {
                pending[postId] = nil
                if let j = posts.firstIndex(where: { $0.id == postId }) {
                    posts[j].mine = before.mine
                    posts[j].tally = before.tally
                }
                notice = AuthStore.message(for: error) ?? String(localized: "Couldn’t save your reaction. Please try again.")
            }
        }
    }

    /// The post with your reaction set to `kind`, its tally moved to match.
    static func reacting(_ p: JourneyPost, _ kind: String?) -> JourneyPost {
        var p = p
        var counts = Dictionary(uniqueKeysWithValues: (p.tally ?? []).map { ($0.kind, $0.count) })
        if let old = p.mine { counts[old, default: 1] -= 1 }
        if let kind { counts[kind, default: 0] += 1 }
        let order = ReactionKind.allCases.map(\.rawValue)
        p.tally = counts.filter { $0.value > 0 }
            .sorted { $0.value != $1.value ? $0.value > $1.value : (order.firstIndex(of: $0.key) ?? 9) < (order.firstIndex(of: $1.key) ?? 9) }
            .map { JourneyPost.Count(kind: $0.key, count: $0.value) }
        p.mine = kind
        return p
    }

    func reactors(_ postId: String) async throws -> [Reactor] {
        if TripStore.isFixture {
            #if DEBUG
            return FeedFixture.reactors[postId] ?? []
            #else
            return []
            #endif
        }
        try await Connectivity.shared.waitUntilOnline()
        return try await client.rpc("event_reactors", params: ["p_event": postId]).execute().value
    }

    // MARK: comments

    func commentAdded(to postId: String) {
        guard let i = posts.firstIndex(where: { $0.id == postId }) else { return }
        posts[i].commentCount = (posts[i].commentCount ?? 0) + 1
    }

    func commentsLoaded(_ postId: String, live: Int) {
        guard let i = posts.firstIndex(where: { $0.id == postId }) else { return }
        posts[i].commentCount = live
    }

    // MARK: the follow link

    /// A new follow link for this journey (`create_share_link`, as Account's "Create
    /// follow link" on the web): the token comes once, so each tap makes a new one.
    func newFollowLink() async throws -> URL {
        if TripStore.isFixture { return Backend.followLink("fixture") }
        struct Params: Encodable, Sendable {
            let p_trip: String; let p_label: String; let p_expires: String?
            func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encode(p_trip, forKey: .p_trip)
                try c.encode(p_label, forKey: .p_label)
                try c.encode(p_expires, forKey: .p_expires)
            }
            enum CodingKeys: CodingKey { case p_trip, p_label, p_expires }
        }
        try await Connectivity.shared.waitUntilOnline()
        let token: String = try await TripStore.oneMoreTry {
            try await client.rpc("create_share_link", params: Params(p_trip: tripId ?? "", p_label: String(localized: "Family"), p_expires: nil))
                .execute().value
        }
        return Backend.followLink(token)
    }
}

/// Setting your reaction on a post (`react`, 34), for both sides of the feed. A nil kind
/// takes it back. The answer is the post's `feed_social` row.
enum Reactions {
    struct Row: Decodable, Sendable {
        let event_id: String
        let mine: String?
        let commentCount: Int?
        let tally: [JourneyPost.Count]?
    }

    static func send(_ eventId: String, _ kind: ReactionKind?, client: SupabaseClient) async throws -> Row? {
        struct Params: Encodable, Sendable {
            let p_event: String
            let p_kind: String?
            // A take-back sends p_kind as null: left out, the call matches no function.
            func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encode(p_event, forKey: .p_event)
                try c.encode(p_kind, forKey: .p_kind)
            }
            enum CodingKeys: CodingKey { case p_event, p_kind }
        }
        try await Connectivity.shared.waitUntilOnline()
        return try await TripStore.oneMoreTry {
            try await client.rpc("react", params: Params(p_event: eventId, p_kind: kind?.rawValue)).execute().value
        }
    }
}

extension Backend {
    /// Where a follow link opens: the web app's /follow page (livhold.com sends app
    /// routes on to app.livhold.com).
    static func followLink(_ token: String) -> URL {
        current.web.appending(path: "follow/\(token)")
    }
}

/// When you last opened the Feed, per journey, on this phone.
enum FeedSeen {
    private static func key(_ tripId: String) -> String { "feed.seen.\(tripId)" }
    static func at(_ tripId: String) -> Date {
        let t = UserDefaults.standard.double(forKey: key(tripId))
        return t > 0 ? Date(timeIntervalSince1970: t) : .distantPast
    }
    static func mark(_ d: Date, tripId: String) {
        UserDefaults.standard.set(d.timeIntervalSince1970, forKey: key(tripId))
    }
}

/// The Feed's last answer, saved per journey for a start with no signal.
enum FeedCache {
    struct Saved: Codable {
        var page: JourneyFeedPage
        var followers: [Follower]
    }

    private static func url(tripId: String) -> URL? {
        guard let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        // Inside "Trips", so signing out (TripCache.clearAll) removes it too.
        let folder = dir.appending(path: "Trips", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder.appending(path: "feed-\(tripId).json")
    }

    static func save(_ s: Saved, tripId: String) {
        guard let url = url(tripId: tripId), let data = try? JSONEncoder().encode(s) else { return }
        try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    static func load(tripId: String) -> Saved? {
        guard let url = url(tripId: tripId), let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Saved.self, from: data)
    }
}
