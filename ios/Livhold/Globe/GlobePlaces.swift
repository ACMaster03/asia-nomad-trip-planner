import Foundation
import Observation
import Supabase

/// Where a journey's places are on the globe. A trip stores names only ("Da Nang",
/// "Budapest, Hungary"), so the globe looks them up the way the web's does
/// (lib/map/globeData.ts): the catalogue's `cities` first, by the same name or the
/// same place under another spelling (`Journey.sameCity`), and failing that the
/// biggest place of that name in `geo_cities` (GeoNames, ~34k towns), in the stop's
/// country when there is one. Found places are kept on the phone, so the globe draws
/// at once next time and offline.
@MainActor
@Observable
final class GlobePlaces {
    static let shared = GlobePlaces()

    struct Place: Codable, Sendable, Equatable {
        let lat: Double
        let lng: Double
        /// The country as the catalogue or GeoNames names it, when the trip didn't say.
        var country: String?
    }

    /// Normalised name (`Journey.normCity`) → place. Bumped on every new find, so a
    /// globe waiting for a stop redraws when it arrives.
    private(set) var known: [String: Place]
    private var asked: Set<String> = []
    private let client: SupabaseClient

    private static let key = "globe.places.v1"

    /// Known without asking: the web's HOME_PLACES, and the fixture's stops.
    private static let builtIn: [String: Place] = [
        "budapest": Place(lat: 47.4979, lng: 19.0402, country: "Hungary"),
        "vienna": Place(lat: 48.2082, lng: 16.3738, country: "Austria"),
        "bangkok": Place(lat: 13.7563, lng: 100.5018, country: "Thailand"),
        "hanoi": Place(lat: 21.0285, lng: 105.8542, country: "Vietnam"),
        "da nang": Place(lat: 16.0544, lng: 108.2022, country: "Vietnam"),
    ]

    init(client: SupabaseClient = Backend.client) {
        self.client = client
        let saved = UserDefaults.standard.data(forKey: Self.key)
            .flatMap { try? JSONDecoder().decode([String: Place].self, from: $0) } ?? [:]
        known = Self.builtIn.merging(saved) { _, new in new }
    }

    /// The place for a name, if it is known: the same name, or the same place under
    /// another spelling ("Hong Kong Island" for "Hong Kong").
    func place(_ name: String) -> Place? {
        let n = Journey.normCity(name)
        if let p = known[n] { return p }
        return known.first { Journey.sameCity($0.key, n) }?.value
    }

    /// Looks up every name not known yet. `country` narrows a GeoNames match.
    func resolve(_ wanted: [(city: String, country: String?)]) async {
        let missing = wanted.filter { !$0.city.isEmpty && place($0.city) == nil && !asked.contains(Journey.normCity($0.city)) }
        guard !missing.isEmpty, !TripStore.isFixture else { return }
        missing.forEach { asked.insert(Journey.normCity($0.city)) }

        var found: [String: Place] = [:]
        // The catalogue: small (a few hundred rows), so it comes whole and is matched here.
        struct Cat: Decodable { let city: String; let country: String?; let lat: Double?; let lng: Double? }
        if let rows: [Cat] = try? await client.from("cities").select("city,country,lat,lng").not("lat", operator: .is, value: "null").execute().value {
            for w in missing {
                let hit = rows.first { $0.city == w.city && $0.lat != nil } ?? rows.first { Journey.sameCity($0.city, w.city) && $0.lat != nil }
                if let h = hit, let lat = h.lat, let lng = h.lng {
                    found[Journey.normCity(w.city)] = Place(lat: lat, lng: lng, country: h.country)
                }
            }
        }
        // GeoNames for the rest: the biggest town of that name, in the stop's country if it has one.
        struct Geo: Decodable {
            let name: String; let lat: Double?; let lng: Double?; let population: Int?
            let geo_countries: Country?
            struct Country: Decodable { let name: String }
        }
        for w in missing where found[Journey.normCity(w.city)] == nil {
            let base = (w.city.components(separatedBy: " (").first ?? w.city).trimmingCharacters(in: .whitespaces)
            guard let rows: [Geo] = try? await client.from("geo_cities")
                .select("name,lat,lng,population,geo_countries(name)")
                .ilike("name", pattern: base)
                .order("population", ascending: false)
                .limit(8)
                .execute().value
            else { continue }
            let country = w.country?.lowercased()
            let pick = rows.first { country != nil && $0.geo_countries?.name.lowercased() == country } ?? rows.first
            if let p = pick, let lat = p.lat, let lng = p.lng {
                found[Journey.normCity(w.city)] = Place(lat: lat, lng: lng, country: p.geo_countries?.name)
            }
        }
        guard !found.isEmpty else { return }
        known.merge(found) { _, new in new }
        let saved = known.filter { Self.builtIn[$0.key] == nil }
        UserDefaults.standard.set(try? JSONEncoder().encode(saved), forKey: Self.key)
    }
}
