import Foundation

extension GlobeJourney {
    /// Your own journey as the globe draws it: home, then the stops in the plan in date
    /// order (the timeline's), joined by their legs. The way home is left off: the
    /// route ends where the journey does. A stop the globe can't place yet is skipped,
    /// and the legs either side of it become one.
    ///
    /// A leg's mode is its booked transport's, else its first idea's. With nothing
    /// typed, a long leg (over 600 km) reads as a flight and a short one as ground.
    @MainActor init(state: TripState, today: String, places: GlobePlaces) {
        let tl = Journey.timeline(state)
        var stops: [Stop] = []
        var legs: [Leg] = []
        var countries: Set<String> = []

        let homePlace = tl.home.isEmpty ? nil : places.place(tl.home)
        if let h = homePlace {
            stops.append(Stop(name: tl.home, lon: h.lng, lat: h.lat, kind: .home))
        }
        // The timeline's legs, without the way home, keyed by the stop they arrive at.
        let legInto: [String: Journey.Leg] = Dictionary(
            tl.legs.filter { !$0.wayHome }.compactMap { leg in leg.to.seg.map { ($0.id, leg) } },
            uniquingKeysWith: { a, _ in a })
        for seg in tl.stops {
            guard let p = places.place(seg.city) else { continue }
            let kind: Kind
            if Journey.isCurrent(seg, today: today) { kind = .now }
            else if !seg.depart.isEmpty, seg.depart <= today { kind = .past }
            else { kind = .next }
            let here = stops.count
            stops.append(Stop(name: seg.city, lon: p.lng, lat: p.lat, kind: kind, id: seg.id))
            if let c = Self.naturalEarthName(seg.country.isEmpty ? p.country : seg.country) { countries.insert(c) }
            // Two stops in one place (a stay split in two) need no leg between them.
            guard here > 0, stops[here - 1].at != stops[here].at else { continue }
            let leg = legInto[seg.id]
            let date = leg?.date ?? seg.arrive
            legs.append(Leg(from: here - 1, to: here, mode: Self.mode(leg, from: stops[here - 1], to: stops[here]),
                            upcoming: date.isEmpty || date > today))
        }
        let homeCountry = Self.naturalEarthName(Self.homeCountry(state.meta.homeBase) ?? homePlace?.country)
        self.init(stops: stops, legs: legs, countries: countries, homeCountry: homeCountry)
    }

    /// The names the trip needs placed: home and every stop in the plan.
    static func wanted(_ state: TripState) -> [(city: String, country: String?)] {
        let tl = Journey.timeline(state)
        var out: [(city: String, country: String?)] = []
        if !tl.home.isEmpty { out.append((tl.home, homeCountry(state.meta.homeBase))) }
        out += tl.stops.map { ($0.city, $0.country.isEmpty ? nil : $0.country) }
        return out
    }

    private static func mode(_ leg: Journey.Leg?, from a: Stop, to b: Stop) -> Mode {
        if let t = leg?.booked ?? leg?.transport.first {
            switch t.type.lowercased() {
            case "flight", "plane": return .flight
            case "train": return .train
            case "bus": return .bus
            case "ferry", "boat": return .ferry
            default: return .other
            }
        }
        // 600 km on the ground is about 0.094 rad of arc.
        return Globe.angle(a.at, b.at) > 0.094 ? .flight : .other
    }

    /// "Budapest, Hungary" → "Hungary".
    private static func homeCountry(_ homeBase: String?) -> String? {
        guard let parts = homeBase?.split(separator: ","), parts.count > 1 else { return nil }
        let c = parts.last!.trimmingCharacters(in: .whitespaces)
        return c.isEmpty ? nil : c
    }

    /// A country as the trip spells it, in Natural Earth's capitals ("VIETNAM").
    static func naturalEarthName(_ country: String?) -> String? {
        guard let c = country?.trimmingCharacters(in: .whitespaces), !c.isEmpty else { return nil }
        let up = c.uppercased()
        return aliases[up] ?? up
    }

    private static let aliases: [String: String] = [
        "UNITED STATES OF AMERICA": "UNITED STATES", "USA": "UNITED STATES", "US": "UNITED STATES",
        "UK": "UNITED KINGDOM", "GREAT BRITAIN": "UNITED KINGDOM", "ENGLAND": "UNITED KINGDOM", "SCOTLAND": "UNITED KINGDOM",
        "CZECH REPUBLIC": "CZECHIA", "LAO PDR": "LAOS", "VIET NAM": "VIETNAM",
        "KOREA": "SOUTH KOREA", "REPUBLIC OF KOREA": "SOUTH KOREA",
        "BOSNIA AND HERZEGOVINA": "BOSNIA AND HERZ.", "DOMINICAN REPUBLIC": "DOMINICAN REP.",
        "UAE": "UNITED ARAB EMIRATES", "BURMA": "MYANMAR", "TÜRKIYE": "TURKEY", "TURKIYE": "TURKEY",
        "NORTH MACEDONIA": "MACEDONIA", "IVORY COAST": "CÔTE D'IVOIRE",
    ]
}
