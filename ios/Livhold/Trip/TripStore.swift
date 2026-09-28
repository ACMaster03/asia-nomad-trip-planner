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
        tracking = MoneyPrefsCache.tracking(userId: userId) ?? .unknown
        cityCosts = MoneyPrefsCache.cities(userId: userId)
        #if DEBUG
        if Self.usesFixture {
            trip = TripFixture.trip(today: Days.today())
            cityCosts = TripFixture.cities
            tracking = UserDefaults.standard.string(forKey: "trackFixture").flatMap(Tracking.init(rawValue:)) ?? .yes
            phase = .ready
            await syncPlan()
            return
        }
        #endif
        if trip == nil, let saved = TripCache.load(userId: userId) {
            trip = saved.row
            fetchedAt = saved.savedAt
            phase = .ready
        }
        async let tracked: Void = refreshTracking()
        await refresh()
        await tracked
    }

    /// Fetches the active trip. Keeps what is shown if the network fails.
    func refresh() async {
        guard let userId, !refreshing, !Self.usesFixture else { return }
        refreshing = true
        defer { refreshing = false }
        do {
            try await Connectivity.shared.waitUntilOnline()
            if let data = try await fetchActiveTrip(userId: userId) {
                var row = try JSONDecoder().decode(TripRow.self, from: data)
                // A fetch that started before a save landed carries the older
                // copy: keep the newer one (the web's withPendingWrites).
                if let shown = trip, shown.id == row.id {
                    if (shown.stateRev ?? 0) > (row.stateRev ?? 0) { return }
                    if ledgerWrites > 0 || (shown.ledgerRev ?? 0) > (row.ledgerRev ?? 0) {
                        row.ledger = shown.ledger
                        row.ledgerRev = shown.ledgerRev
                    }
                }
                trip = row
                fetchedAt = .now
                phase = .ready
                error = nil
                TripCache.save(data, userId: userId)
                if let role = await fetchRole(row, userId: userId) { canEdit = role }
                Task { await syncPlan() }
                await loadCities(for: row)
            } else {
                trip = nil
                phase = .empty
                TripCache.clear(userId: userId)
            }
        } catch is CancellationError {
            return
        } catch {
            self.error = AuthStore.message(for: error) ?? String(localized: "Couldn’t load your journey.")
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
                String(localized: "Someone else changed this trip at the same time, so your change wasn’t saved and the latest version is loaded. Please redo your edit.")
            case .denied:
                String(localized: "Your edit access to this trip was removed, so this change wasn’t saved.")
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
            self.trip = try trip.with(rawState: doc, name: name, updatedAt: trip.updatedAt, stateRev: (trip.stateRev ?? 0) + 1)
            Task { await syncPlan() }
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
            // The ledger may have moved on while this saved (Money writes it separately).
            let saved = try (self.trip ?? trip).with(rawState: doc, name: name,
                                                     updatedAt: ISO8601DateFormatter().string(from: .now), stateRev: rev)
            self.trip = saved
            Task { await syncPlan() }
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
            throw SaveError.failed(AuthStore.message(for: error) ?? String(localized: "Couldn’t save your change. Please try again."))
        }
    }

    // MARK: Money

    /// `profiles.track_spending`: nil in the database means not asked yet.
    enum Tracking: String { case yes, no, ask, unknown }

    private(set) var tracking: Tracking = .unknown
    /// The trip's cities' catalogue costs, for a stop without a stay or a pace.
    private(set) var cityCosts: [String: CityCost] = [:]
    /// Ledger writes still on their way; a refetch keeps the ledger shown meanwhile.
    private var ledgerWrites = 0

    func refreshTracking() async {
        guard let userId, !Self.usesFixture else { return }
        struct Row: Decodable { let track_spending: Bool? }
        do {
            try await Connectivity.shared.waitUntilOnline()
            let rows: [Row] = try await client.from("profiles").select("track_spending").eq("id", value: userId).limit(1).execute().value
            guard let row = rows.first else { return }
            tracking = row.track_spending.map { $0 ? .yes : .no } ?? .ask
            MoneyPrefsCache.save(tracking: tracking, userId: userId)
        } catch {
            // Keep what was known; the page shows as it did last time.
        }
    }

    /// Answers the tracking question, or flips the switch in Settings → Money.
    func setTracking(_ on: Bool) async throws {
        let before = tracking
        tracking = on ? .yes : .no
        guard let userId, !Self.usesFixture else { return }
        MoneyPrefsCache.save(tracking: tracking, userId: userId)
        do {
            try await Connectivity.shared.waitUntilOnline()
            try await client.from("profiles").update(["track_spending": on]).eq("id", value: userId).execute()
        } catch {
            tracking = before
            MoneyPrefsCache.save(tracking: before, userId: userId)
            throw SaveError.failed(AuthStore.message(for: error) ?? String(localized: "Couldn’t save that. Please try again."))
        }
    }

    /// Adds or replaces one ledger entry. Shown at once; the web's
    /// `ledger_upsert_entry` replaces it by id, so a retry can't double it.
    func upsertEntry(_ entry: LedgerEntry) async throws {
        guard let trip else { return }
        let before = trip.ledger.first { $0.id == entry.id }
        applyLedger { $0 = $0.filter { $0.id != entry.id } + [entry] }
        guard !Self.usesFixture else { return }
        struct Params: Encodable, Sendable { let trip: String; let entry: JSONValue }
        ledgerWrites += 1
        defer { ledgerWrites -= 1 }
        do {
            try await Connectivity.shared.waitUntilOnline()
            let rev: Int = try await client.rpc("ledger_upsert_entry", params: Params(trip: trip.id, entry: entry.json)).execute().value
            let known = self.trip?.ledgerRev ?? 0
            self.trip?.ledgerRev = rev
            cacheTrip()
            // Someone else wrote in between: fetch their entries (the web refetches after every write).
            if rev > known + 1 { Task { await refresh() } }
        } catch {
            applyLedger { list in
                list.removeAll { $0.id == entry.id }
                if let before { list.append(before) }
            }
            throw ledgerError(error)
        }
    }

    /// Booked stays and legs into All entries, kept in line with their bookings
    /// (PlanSync.swift, the web's usePlanSync). One pass at a time; every write
    /// is by id, so a second pass, or the web doing the same, can't double a row.
    private var syncingPlan = false

    func syncPlan() async {
        // A viewer never writes: every row would bounce off the database.
        guard let trip, canEdit, !syncingPlan else { return }
        // `false` is the opt-out: then only rows already there are kept in line.
        let autoImport = trip.rawState["autoImport"]?.boolValue ?? true
        let writes = PlanSync.plan(trip).writes(autoImport: autoImport)
        guard !writes.isEmpty else { return }
        syncingPlan = true
        defer { syncingPlan = false }
        for entry in writes {
            // Offline waits inside; a refusal stops the pass, the next open tries again.
            do { try await upsertEntry(entry) } catch { break }
        }
    }

    /// Deletes one ledger entry. One that came from a booking or a subscription
    /// is first added to `importSkip`, so the web doesn't write it again.
    func deleteEntry(_ entry: LedgerEntry) async throws {
        guard let trip else { return }
        if let source = entry.source, source.kind != "extra" {
            try await save { doc in
                var skip: [JSONValue] = []
                if case .array(let a)? = doc["importSkip"] { skip = a }
                if !skip.contains(.string(source.key)) { skip.append(.string(source.key)) }
                doc["importSkip"] = .array(skip)
            }
        }
        let index = trip.ledger.firstIndex { $0.id == entry.id }
        applyLedger { $0.removeAll { $0.id == entry.id } }
        guard !Self.usesFixture else { return }
        struct Params: Encodable, Sendable { let trip: String; let entry_id: String }
        ledgerWrites += 1
        defer { ledgerWrites -= 1 }
        do {
            try await Connectivity.shared.waitUntilOnline()
            let rev: Int = try await client.rpc("ledger_delete_entry", params: Params(trip: trip.id, entry_id: entry.id)).execute().value
            let known = self.trip?.ledgerRev ?? 0
            self.trip?.ledgerRev = rev
            cacheTrip()
            // Someone else wrote in between: fetch their entries (the web refetches after every write).
            if rev > known + 1 { Task { await refresh() } }
        } catch {
            applyLedger { list in list.insert(entry, at: min(index ?? list.count, list.count)) }
            throw ledgerError(error)
        }
    }

    private func applyLedger(_ change: (inout [LedgerEntry]) -> Void) {
        guard var t = trip else { return }
        change(&t.ledger)
        trip = t
        cacheTrip()
    }

    private func cacheTrip() {
        guard let userId, let trip, !Self.usesFixture, let data = try? JSONEncoder().encode(trip) else { return }
        TripCache.save(data, userId: userId)
    }

    private func ledgerError(_ error: Error) -> Error {
        if let e = error as? PostgrestError, e.code == "42501" {
            canEdit = false
            return SaveError.denied
        }
        if error is CancellationError { return error }
        return SaveError.failed(AuthStore.message(for: error) ?? String(localized: "Couldn’t save that entry. Please try again."))
    }

    /// Catalogue costs of the trip's cities (catalogue/queries.ts fetchCitiesByName).
    private func loadCities(for row: TripRow) async {
        let names = Array(Set(row.state.segments.map(\.city).filter { !$0.isEmpty }))
        guard !names.isEmpty, let userId else { return }
        struct City: Decodable { let city: String; let attributes: JSONValue? }
        guard let rows: [City] = try? await client.from("cities").select("city,attributes").in("city", values: names).execute().value
        else { return }
        var out: [String: CityCost] = [:]
        for r in rows { if let a = r.attributes, let cost = CityCost(attributes: a) { out[r.city] = cost } }
        cityCosts = out
        MoneyPrefsCache.save(cities: out, userId: userId)
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
        MoneyPrefsCache.clearAll()
        guard let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return }
        try? FileManager.default.removeItem(at: dir.appending(path: "Trips", directoryHint: .isDirectory))
    }
}

/// Small Money answers kept between launches, per user: the tracking answer and
/// the trip's city costs, so the page draws right away with no signal.
enum MoneyPrefsCache {
    private static func key(_ what: String, _ userId: String) -> String { "money.\(what).\(userId)" }

    static func tracking(userId: String) -> TripStore.Tracking? {
        UserDefaults.standard.string(forKey: key("tracking", userId)).flatMap(TripStore.Tracking.init(rawValue:))
    }

    static func save(tracking: TripStore.Tracking, userId: String) {
        UserDefaults.standard.set(tracking.rawValue, forKey: key("tracking", userId))
    }

    static func cities(userId: String) -> [String: CityCost] {
        guard let data = UserDefaults.standard.data(forKey: key("cities", userId)) else { return [:] }
        return (try? JSONDecoder().decode([String: CityCost].self, from: data)) ?? [:]
    }

    static func save(cities: [String: CityCost], userId: String) {
        UserDefaults.standard.set(try? JSONEncoder().encode(cities), forKey: key("cities", userId))
    }

    static func clearAll() {
        for k in UserDefaults.standard.dictionaryRepresentation().keys where k.hasPrefix("money.") {
            UserDefaults.standard.removeObject(forKey: k)
        }
    }
}
