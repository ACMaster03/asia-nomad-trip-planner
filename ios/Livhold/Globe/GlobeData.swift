import Foundation
import simd

/// Natural Earth 50m for the globe (#166): every country's outline, the coastline and
/// the borders, as points on the unit sphere, with the names that go on them.
/// `tools/globe-data.mjs` makes the two files in `Globe/Data/`; this reads them once.
///
/// Points are unit vectors (x toward 0°E on the equator, z toward the north pole), so
/// turning the globe is one small matrix product per point and a line that crosses the
/// 180th meridian needs no special case.
final class GlobeData: Sendable {
    /// A ring or a line, with the smallest cap of the sphere that holds it, so the
    /// drawing can skip it whole when that cap is out of sight.
    struct Shape: Sendable {
        let points: [SIMD3<Float>]
        let center: SIMD3<Float>
        /// The cap's angular radius, in radians.
        let radius: Float
    }

    struct Country: Sendable {
        /// ISO 3166 numeric, as Natural Earth writes it ("704" is Vietnam).
        let id: String?
        let name: String
        let nameHu: String
        /// Where the name goes; nil when the country gets no name (Antarctica).
        let anchor: SIMD3<Float>?
        let anchorLonLat: SIMD2<Double>?
        /// √(area in steradians): the name shows once `radius × size` is big enough.
        let size: Double
        let rings: [Shape]
    }

    /// A continent, an ocean, a sea or a region of land.
    struct Place: Decodable, Sendable {
        let en: String
        let hu: String
        let lat: Double
        let lng: Double
        /// Oceans: how many degrees of longitude the name spans along its parallel.
        let span: Double?
        /// Seas and regions: the zoom it appears from.
        let kmin: Double?
        /// "sea" or "land".
        let kind: String?
    }

    let countries: [Country]
    let coast: [Shape]
    let borders: [Shape]
    let continents: [Place]
    let oceans: [Place]
    let places: [Place]

    /// Loaded on first use (about 20 ms), then kept for the life of the app.
    static let shared: GlobeData? = GlobeData(bundle: .main)

    init?(bundle: Bundle) {
        guard let binURL = bundle.url(forResource: "globe50m", withExtension: "bin"),
              let namesURL = bundle.url(forResource: "globe-names", withExtension: "json"),
              let bin = try? Data(contentsOf: binURL, options: .mappedIfSafe),
              let namesData = try? Data(contentsOf: namesURL),
              let names = try? JSONDecoder().decode(NamesFile.self, from: namesData)
        else { return nil }

        var reader = Reader(data: bin)
        guard reader.magic() == "LVG1" else { return nil }

        let countryCount = Int(reader.u32())
        var countries: [Country] = []
        countries.reserveCapacity(countryCount)
        for i in 0..<countryCount {
            let ringCount = Int(reader.u32())
            let rings = (0..<ringCount).map { _ in Self.shape(reader.points()) }
            let row = i < names.countries.count ? names.countries[i] : nil
            let at = row?.at.map { SIMD2<Double>($0[0], $0[1]) }
            countries.append(Country(
                id: row?.id,
                name: row?.name ?? "",
                nameHu: row?.hu ?? row?.name ?? "",
                anchor: at.map { Self.unit(lon: $0.x, lat: $0.y) },
                anchorLonLat: at,
                size: row?.size ?? 0,
                rings: rings
            ))
        }
        let coast = (0..<Int(reader.u32())).map { _ in Self.shape(reader.points()) }
        let borders = (0..<Int(reader.u32())).map { _ in Self.shape(reader.points()) }

        self.countries = countries
        self.coast = coast
        self.borders = borders
        self.continents = names.continents
        self.oceans = names.oceans
        self.places = names.places
    }

    /// A point on the unit sphere from degrees.
    static func unit(lon: Double, lat: Double) -> SIMD3<Float> {
        let l = lon * .pi / 180, p = lat * .pi / 180
        return SIMD3(Float(cos(p) * cos(l)), Float(cos(p) * sin(l)), Float(sin(p)))
    }

    private static func shape(_ lonLat: [SIMD2<Float>]) -> Shape {
        let pts = lonLat.map { unit(lon: Double($0.x), lat: Double($0.y)) }
        var sum = pts.reduce(SIMD3<Float>(repeating: 0), +)
        if simd_length(sum) < 1e-6 { sum = pts.first ?? SIMD3(1, 0, 0) }
        let c = simd_normalize(sum)
        let minDot = pts.reduce(Float(1)) { min($0, simd_dot($1, c)) }
        return Shape(points: pts, center: c, radius: acos(max(-1, min(1, minDot))))
    }

    private struct NamesFile: Decodable {
        struct CountryRow: Decodable {
            let id: String?
            let name: String
            let hu: String
            let at: [Double]?
            let size: Double
        }
        let countries: [CountryRow]
        let continents: [Place]
        let oceans: [Place]
        let places: [Place]
    }

    /// Little-endian reader for globe50m.bin (layout in tools/globe-data.mjs).
    private struct Reader {
        let data: Data
        var at = 0

        init(data: Data) { self.data = data }

        mutating func magic() -> String {
            defer { at += 4 }
            return String(decoding: data[at..<at + 4], as: UTF8.self)
        }

        mutating func u32() -> UInt32 {
            defer { at += 4 }
            return data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: at, as: UInt32.self) }.littleEndian
        }

        mutating func points() -> [SIMD2<Float>] {
            let n = Int(u32())
            let start = at
            at += n * 8
            return data.withUnsafeBytes { raw in
                (0..<n).map { i in
                    SIMD2(Float(bitPattern: raw.loadUnaligned(fromByteOffset: start + i * 8, as: UInt32.self).littleEndian),
                          Float(bitPattern: raw.loadUnaligned(fromByteOffset: start + i * 8 + 4, as: UInt32.self).littleEndian))
                }
            }
        }
    }
}
