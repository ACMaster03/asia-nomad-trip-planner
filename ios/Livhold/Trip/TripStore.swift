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
    /// When the shown copy was fetched from the server: the saved-copy line says how old it is.
    private(set) var fetchedAt: Date?
    /// When the current fetch began, for the loading screen's `WaitingNote`.
    private(set) var refreshStarted: Date?
    /// Owner or co-editor. Fails open while unknown, like the web: on the road an
    /// owner losing every edit button to a network blip is the worse failure, and
    /// the database refuses a viewer's write anyway.
    private(set) var canEdit = true
    /// Why a quick edit (from a long-press menu) didn't save; shown on the timeline.
    var saveNotice: String?

    let client: SupabaseClient
    private(set) var userId: String?

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
        fx = FxCache.load()
        if trip == nil, let saved = TripCache.load(userId: userId) {
            trip = withLiveRates(saved.row)
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
        refreshStarted = .now
        defer { refreshing = false; refreshStarted = nil }
        do {
            try await Connectivity.shared.waitUntilOnline()
            await refreshFx()
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
                trip = withLiveRates(row)
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
            self.error = Self.loadMessage(error, saved: trip != nil)
            if trip == nil { phase = .failed }
        }
    }

    /// Starts a new journey the web's way (lib/trips/queries.ts createTrip, seeded
    /// by newTrip.ts makeNewTripState), makes it the active one and shows it.
    /// `id` is made once per form: if an earlier try landed and only its answer was
    /// lost, the insert hits our own id (23505) and counts as done, so a retry
    /// never makes a second journey.
    func createTrip(id: String, name: String, startDate: String, endDate: String?, homeBase: String?,
                    baseCurrency: String, travelers: Int) async throws {
        guard let userId else {
            throw SaveError.failed(String(localized: "Couldn’t start the journey. Please try again."))
        }
        let seed = NewTripSeed.state(name: name, startDate: startDate, endDate: endDate, homeBase: homeBase,
                                     baseCurrency: baseCurrency, travelers: travelers)
        let tripName = seed["meta"]?["tripName"]?.stringValue ?? name

        if Self.usesFixture {
            trip = try TripRow(id: id, owner: userId, name: tripName, rawState: seed,
                               updatedAt: ISO8601DateFormatter().string(from: .now), stateRev: 1)
            canEdit = true
            phase = .ready
            return
        }

        struct NewRow: Encodable, Sendable {
            let id: String
            let owner: String
            let name: String
            let state: JSONValue
            let ledger: [JSONValue]
        }
        struct Active: Encodable, Sendable { let active_trip_id: String }
        do {
            try await Connectivity.shared.waitUntilOnline()
            do {
                try await Self.oneMoreTry {
                    try await client.from("trips")
                        .insert(NewRow(id: id, owner: userId, name: tripName, state: seed, ledger: []))
                        .execute()
                }
            } catch let e as PostgrestError where e.code == "23505" {
                // Our own id is already there: the earlier try landed.
            }
            // Best effort, as on the web: the newest journey is shown anyway.
            _ = try? await client.from("profiles")
                .update(Active(active_trip_id: id))
                .eq("id", value: userId)
                .execute()
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw SaveError.failed(AuthStore.message(for: error) ?? String(localized: "Couldn’t start the journey. Please try again."))
        }
        // A refresh already on its way would return early and show the old journey.
        while refreshing { try? await Task.sleep(for: .milliseconds(100)) }
        await refresh()
    }

    /// The first request after a pause can fail with -1005: cellular networks and
    /// VPNs drop idle connections, and iOS doesn't resend a POST on its own. Every
    /// write here is safe to send twice (fixed ids; write_state checks the
    /// revision), so it gets one more try on a fresh connection.
    static func oneMoreTry<T>(_ op: () async throws -> T, resent: (() -> Void)? = nil) async throws -> T {
        do {
            return try await op()
        } catch let e as URLError where e.code == .networkConnectionLost {
            resent?()
            return try await op()
        }
    }

    /// Why a fetch failed, in Trip's words: AuthStore's wording for a lost
    /// connection talks about signing in.
    private static func loadMessage(_ error: Error, saved: Bool) -> String {
        if let url = error as? URLError, [.notConnectedToInternet, .networkConnectionLost, .dataNotAllowed].contains(url.code) {
            return saved ? String(localized: "No connection.") : String(localized: "No connection. Try again once you’re back online.")
        }
        return AuthStore.message(for: error) ?? String(localized: "Couldn’t load your journey.")
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
        var resent = false
        do {
            try await Connectivity.shared.waitUntilOnline()
            let rev: Int = try await Self.oneMoreTry({
                try await client
                    .rpc("write_state", params: Params(trip: trip.id, new_state: doc, new_name: name, expected_rev: trip.stateRev ?? 0))
                    .execute()
                    .value
            }, resent: { resent = true })
            // The ledger may have moved on while this saved (Money writes it separately).
            let saved = try (self.trip ?? trip).with(rawState: doc, name: name,
                                                     updatedAt: ISO8601DateFormatter().string(from: .now), stateRev: rev)
            self.trip = withLiveRates(saved)
            Task { await syncPlan() }
            if let userId, let data = try? JSONEncoder().encode(saved) { TripCache.save(data, userId: userId) }
        } catch let e as PostgrestError where e.code == "REV01" {
            await refresh()
            // The first send landed after all: what's stored now is this very change.
            if resent, self.trip?.rawState == doc { return }
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
            try await Self.oneMoreTry { try await client.from("profiles").update(["track_spending": on]).eq("id", value: userId).execute() }
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
            let rev: Int = try await Self.oneMoreTry { try await client.rpc("ledger_upsert_entry", params: Params(trip: trip.id, entry: entry.json)).execute().value }
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
        let writes = PlanSync.plan(trip, today: Days.today()).writes(autoImport: autoImport)
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
            let rev: Int = try await Self.oneMoreTry { try await client.rpc("ledger_delete_entry", params: Params(trip: trip.id, entry_id: entry.id)).execute().value }
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

    // MARK: Exchange rates

    /// `fx_rates` (units per 1 USD) and when `fx-refresh` last succeeded. The cron
    /// runs at 02:00 UTC, so the rates are the morning's (lib/catalogue/fx.ts).
    struct FxSnapshot: Codable, Sendable {
        let perUsd: [String: Double]
        let lastSuccessAt: Date?
        var fetchedAt: Date
    }

    private(set) var fx: FxSnapshot?

    /// At most once an hour: the feed moves once a day.
    func refreshFx() async {
        if let fx, Date.now.timeIntervalSince(fx.fetchedAt) < 3600 { return }
        struct Rate: Decodable { let code: String; let per_usd: Double }
        struct Status: Decodable { let last_success_at: String? }
        do {
            let rates: [Rate] = try await client.from("fx_rates").select("code,per_usd").execute().value
            let status: [Status] = (try? await client.from("fx_status").select("last_success_at").eq("id", value: true).limit(1).execute().value) ?? []
            guard !rates.isEmpty else { return }
            let when = status.first?.last_success_at.flatMap(Self.parseTimestamp)
            fx = FxSnapshot(perUsd: Dictionary(rates.map { ($0.code, $0.per_usd) }, uniquingKeysWith: { a, _ in a }),
                            lastSuccessAt: when, fetchedAt: .now)
            FxCache.save(fx)
            if let trip { self.trip = withLiveRates(trip) }
        } catch {
            // Keep the rates the journey was saved with.
        }
    }

    /// The web's merge (useTripScreen.ts): every currency the journey has, at the
    /// morning's rate, falling back to the stored one; never 0.
    private func withLiveRates(_ row: TripRow) -> TripRow {
        guard let perUsd = fx?.perUsd else { return row }
        var row = row
        let base = row.state.meta.baseCurrency
        var rates: [String: Double] = [:]
        for (code, stored) in row.state.rates {
            if let a = perUsd[base], let b = perUsd[code], a > 0, b > 0 { rates[code] = a / b } else { rates[code] = stored }
        }
        rates[base] = 1
        row.state.rates = rates
        return row
    }

    private static func parseTimestamp(_ s: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        if let d = f.date(from: s) { return d }
        // Postgres' own text form: "2026-09-28 02:00:04.123+00"
        let p = DateFormatter()
        p.locale = Locale(identifier: "en_US_POSIX")
        for format in ["yyyy-MM-dd HH:mm:ss.SSSSSSXXXXX", "yyyy-MM-dd HH:mm:ss.SSSXXXXX", "yyyy-MM-dd HH:mm:ssXXXXX", "yyyy-MM-dd HH:mm:ss.SSSSSSX", "yyyy-MM-dd HH:mm:ssX"] {
            p.dateFormat = format
            if let d = p.date(from: s) { return d }
        }
        return nil
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
/// The last exchange rates fetched, for a start with no signal. Not per user: the rates are everyone's.
enum FxCache {
    private static let key = "fx.snapshot"
    static func load() -> TripStore.FxSnapshot? {
        UserDefaults.standard.data(forKey: key).flatMap { try? JSONDecoder().decode(TripStore.FxSnapshot.self, from: $0) }
    }
    static func save(_ fx: TripStore.FxSnapshot?) {
        UserDefaults.standard.set(fx.flatMap { try? JSONEncoder().encode($0) }, forKey: key)
    }
}

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
