import Foundation
import Observation
import Supabase

/// The active journey, local-first. The copy saved on the phone shows at once
/// (no spinner, works in a bus with no signal); the server's copy replaces it
/// quietly when it arrives. The web does the same with its 24 h IndexedDB cache.
///
/// Which trip: `profiles.active_trip_id` if the user can still see it, else the
/// most recently updated trip they can see (lib/trips/queries.ts resolveActiveTrip).
@MainActor
@Observable
final class TripStore {
    enum Phase: Equatable {
        /// Nothing saved yet and the first fetch hasn't answered.
        case loading
        case ready
        /// Signed in, but no journeys yet.
        case empty
        /// Nothing saved and the fetch failed; `error` says why.
        case failed
    }

    private(set) var phase: Phase = .loading
    private(set) var trip: TripRow?
    private(set) var refreshing = false
    private(set) var error: String?
    /// When the shown copy was fetched from the server.
    private(set) var fetchedAt: Date?

    private let client: SupabaseClient
    private var userId: String?

    init(client: SupabaseClient = Backend.client) {
        self.client = client
    }

    /// Debug builds launched with `-tripFixture YES` show the web's dev fixture and
    /// never fetch, so the screen can be compared with /dev/trip-preview.
    private static var usesFixture: Bool {
        #if DEBUG
        UserDefaults.standard.bool(forKey: "tripFixture")
        #else
        false
        #endif
    }

    /// Call when the signed-in user is known: shows the saved copy, then refreshes.
    func start(userId: String) async {
        self.userId = userId
        #if DEBUG
        if Self.usesFixture {
            trip = TripFixture.trip(today: Days.today())
            phase = .ready
            return
        }
        #endif
        if trip == nil, let saved = TripCache.load(userId: userId) {
            trip = saved.row
            fetchedAt = saved.savedAt
            phase = .ready
        }
        await refresh()
    }

    /// Fetches the active trip. Keeps what is shown if the network fails.
    func refresh() async {
        guard let userId, !refreshing, !Self.usesFixture else { return }
        refreshing = true
        defer { refreshing = false }
        do {
            try await Connectivity.shared.waitUntilOnline()
            if let data = try await fetchActiveTrip(userId: userId) {
                let row = try JSONDecoder().decode(TripRow.self, from: data)
                trip = row
                fetchedAt = .now
                phase = .ready
                error = nil
                TripCache.save(data, userId: userId)
            } else {
                trip = nil
                phase = .empty
                TripCache.clear(userId: userId)
            }
        } catch is CancellationError {
            return
        } catch {
            self.error = AuthStore.message(for: error) ?? "Couldn’t load your journey."
            if trip == nil { phase = .failed }
        }
    }

    /// The raw JSON of the active trip row, or nil when the user has none.
    private func fetchActiveTrip(userId: String) async throws -> Data? {
        struct Profile: Decodable { let active_trip_id: String? }
        let profiles: [Profile] = (try? await client.from("profiles")
            .select("active_trip_id")
            .eq("id", value: userId)
            .limit(1)
            .execute()
            .value) ?? []

        if let selected = profiles.first?.active_trip_id {
            let data = try await client.from("trips")
                .select(TripRow.columns)
                .eq("id", value: selected)
                .limit(1)
                .execute()
                .data
            if let row = Self.firstObject(data) { return row }
        }
        let data = try await client.from("trips")
            .select(TripRow.columns)
            .order("updated_at", ascending: false)
            .order("created_at", ascending: false)
            .limit(1)
            .execute()
            .data
        return Self.firstObject(data)
    }

    /// The first element of a JSON array, re-encoded on its own.
    private static func firstObject(_ data: Data) -> Data? {
        guard let array = try? JSONSerialization.jsonObject(with: data) as? [Any],
              let first = array.first
        else { return nil }
        return try? JSONSerialization.data(withJSONObject: first)
    }
}

/// The last trip fetched, per user, in Application Support. Cleared on sign-out.
enum TripCache {
    struct Saved { let row: TripRow; let savedAt: Date }

    private static func url(userId: String) -> URL? {
        guard let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        let folder = dir.appending(path: "Trips", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder.appending(path: "trip-\(userId).json")
    }

    static func save(_ data: Data, userId: String) {
        guard let url = url(userId: userId) else { return }
        try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    static func load(userId: String) -> Saved? {
        guard let url = url(userId: userId),
              let data = try? Data(contentsOf: url),
              let row = try? JSONDecoder().decode(TripRow.self, from: data)
        else { return nil }
        let savedAt = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? .distantPast
        return Saved(row: row, savedAt: savedAt)
    }

    static func clear(userId: String) {
        guard let url = url(userId: userId) else { return }
        try? FileManager.default.removeItem(at: url)
    }

    /// Every saved trip, for sign-out: nothing of a journey stays on a shared phone.
    static func clearAll() {
        guard let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return }
        try? FileManager.default.removeItem(at: dir.appending(path: "Trips", directoryHint: .isDirectory))
    }
}
