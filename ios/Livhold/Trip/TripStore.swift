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
    /// Owner or co-editor. Fails open while unknown, like the web: on the road an
    /// owner losing every edit button to a network blip is the worse failure, and
    /// the database refuses a viewer's write anyway.
    private(set) var canEdit = true
    /// Why a quick edit (from a long-press menu) didn't save; shown on the timeline.
    var saveNotice: String?

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
                // A fetch that started before a save landed carries the older
                // copy: keep the newer one (the web's withPendingWrites).
                if let shown = trip, shown.id == row.id, (shown.stateRev ?? 0) > (row.stateRev ?? 0) { return }
                trip = row
                fetchedAt = .now
                phase = .ready
                error = nil
                TripCache.save(data, userId: userId)
                if let role = await fetchRole(row, userId: userId) { canEdit = role }
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

    /// Whether this user may edit the trip (lib/trips/role.ts), nil when the
    /// lookup failed.
    private func fetchRole(_ row: TripRow, userId: String) async -> Bool? {
        if row.owner?.lowercased() == userId { return true }
        struct Member: Decodable { let role: String? }
        guard let members: [Member] = try? await client.from("trip_members")
            .select("role")
            .eq("trip_id", value: row.id)
            .eq("user_id", value: userId)
            .limit(1)
            .execute()
            .value
        else { return nil }
        return members.first?.role == "editor"
    }

    // MARK: saving

    enum SaveError: LocalizedError {
        case conflict, denied, failed(String)

        var errorDescription: String? {
            switch self {
            case .conflict:
                "Someone else changed this trip at the same time, so your change wasn’t saved and the latest version is loaded. Please redo your edit."
            case .denied:
                "Your edit access to this trip was removed, so this change wasn’t saved."
            case .failed(let why):
                why
            }
        }
    }

    /// Saves one edit: changes the document as stored (every field the phone
    /// doesn't know about is kept) and writes it through the web's `write_state`,
    /// which refuses if anyone else saved since this copy was fetched. Waits for a
    /// connection; throws `SaveError`, and on a conflict loads the latest copy.
    func save(_ change: (inout JSONValue) -> Void) async throws {
        guard let trip else { return }
        var doc = trip.rawState
        change(&doc)
        let name = doc["meta"]?["tripName"]?.stringValue ?? trip.name ?? "Trip"

        if Self.usesFixture {
            self.trip = try TripRow(id: trip.id, owner: trip.owner, name: name, rawState: doc,
                                    updatedAt: trip.updatedAt, stateRev: (trip.stateRev ?? 0) + 1)
            return
        }

        struct Params: Encodable, Sendable {
            let trip: String
            let new_state: JSONValue
            let new_name: String
            let expected_rev: Int
        }
        do {
            try await Connectivity.shared.waitUntilOnline()
            let rev: Int = try await client
                .rpc("write_state", params: Params(trip: trip.id, new_state: doc, new_name: name, expected_rev: trip.stateRev ?? 0))
                .execute()
                .value
            let saved = try TripRow(id: trip.id, owner: trip.owner, name: name, rawState: doc,
                                    updatedAt: ISO8601DateFormatter().string(from: .now), stateRev: rev)
            self.trip = saved
            if let userId, let data = try? JSONEncoder().encode(saved) { TripCache.save(data, userId: userId) }
        } catch let e as PostgrestError where e.code == "REV01" {
            await refresh()
            throw SaveError.conflict
        } catch let e as PostgrestError where e.code == "42501" {
            canEdit = false
            throw SaveError.denied
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw SaveError.failed(AuthStore.message(for: error) ?? "Couldn’t save your change. Please try again.")
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
