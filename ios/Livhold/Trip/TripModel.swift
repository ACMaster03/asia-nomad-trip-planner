import Foundation

// The trip as the web stores it: ONE jsonb document in `trips.state`
// (product/src/lib/trips/types.ts). The typed structs below are for reading;
// saves edit `TripRow.rawState`, the document exactly as stored (JSONValue.swift).
//
// Decoding is deliberately forgiving. The web's types are "migration-free":
// older journeys simply lack newer fields, and a number can arrive as a string
// from an old import. One odd value must never hide the whole trip, so every
// field is optional here, numbers accept strings, and a list skips the one item
// it can't read instead of failing.

/// A row of `public.trips`, the columns iOS reads.
struct TripRow: Codable, Sendable {
    let id: String
    let owner: String?
    let name: String?
    /// Its `rates` carry the morning's rates once TripStore has them (`withLiveRates`).
    var state: TripState
    /// `state` exactly as stored, every field kept: what a save edits and sends back.
    let rawState: JSONValue
    let updatedAt: String?
    let stateRev: Int?
    /// `trips.ledger`: what was spent, one entry per row (Money/Ledger.swift).
    var ledger: [LedgerEntry] = []
    var ledgerRev: Int?
    /// When the journey was made; journeys older than Money round 2 keep every card.
    var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, owner, name, state, ledger
        case updatedAt = "updated_at"
        case stateRev = "state_rev"
        case ledgerRev = "ledger_rev"
        case createdAt = "created_at"
    }

    init(id: String, owner: String?, name: String?, rawState: JSONValue, updatedAt: String?, stateRev: Int?,
         ledger: [LedgerEntry] = [], ledgerRev: Int? = nil, createdAt: String? = nil) throws {
        self.id = id
        self.owner = owner
        self.name = name
        self.rawState = rawState
        self.state = try JSONDecoder().decode(TripState.self, from: JSONEncoder().encode(rawState))
        self.updatedAt = updatedAt
        self.stateRev = stateRev
        self.ledger = ledger
        self.ledgerRev = ledgerRev
        self.createdAt = createdAt
    }

    /// The same row with another state document (after a save).
    func with(rawState: JSONValue, name: String?, updatedAt: String?, stateRev: Int?) throws -> TripRow {
        try TripRow(id: id, owner: owner, name: name, rawState: rawState, updatedAt: updatedAt, stateRev: stateRev,
                    ledger: ledger, ledgerRev: ledgerRev, createdAt: createdAt)
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        owner = c.str(.owner)
        name = c.str(.name)
        state = try c.decode(TripState.self, forKey: .state)
        rawState = (try? c.decode(JSONValue.self, forKey: .state)) ?? .object([:])
        updatedAt = c.str(.updatedAt)
        stateRev = c.num(.stateRev).map { Int($0) }
        if case .array(let rows)? = try? c.decode(JSONValue.self, forKey: .ledger) {
            ledger = rows.map(LedgerEntry.init(raw:)).filter { !$0.id.isEmpty }
        }
        ledgerRev = c.num(.ledgerRev).map { Int($0) }
        createdAt = c.str(.createdAt)
    }

    /// For the copy saved on the phone: the raw document, never the typed one.
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encodeIfPresent(owner, forKey: .owner)
        try c.encodeIfPresent(name, forKey: .name)
        try c.encode(rawState, forKey: .state)
        try c.encodeIfPresent(updatedAt, forKey: .updatedAt)
        try c.encodeIfPresent(stateRev, forKey: .stateRev)
        try c.encode(JSONValue.array(ledger.map(\.json)), forKey: .ledger)
        try c.encodeIfPresent(ledgerRev, forKey: .ledgerRev)
        try c.encodeIfPresent(createdAt, forKey: .createdAt)
    }

    /// The columns to select — the web's TRIP_COLS (queries.ts).
    static let columns = "id,owner,name,state,ledger,updated_at,created_at,state_rev,ledger_rev"
}

struct TripState: Codable, Sendable {
    var meta: TripMeta
    /// Base currency per one unit of each currency.
    var rates: [String: Double]
    var segments: [Segment]
    var stays: [Stay]
    var transport: [TransportLeg]

    enum CodingKeys: String, CodingKey { case meta, rates, segments, stays, transport }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        meta = (try? c.decode(TripMeta.self, forKey: .meta)) ?? TripMeta()
        rates = ((try? c.decode([String: LenientNumber].self, forKey: .rates)) ?? [:]).compactMapValues(\.value)
        segments = c.lossyList(.segments)
        stays = c.lossyList(.stays)
        transport = c.lossyList(.transport)
    }

    init(meta: TripMeta, rates: [String: Double], segments: [Segment], stays: [Stay], transport: [TransportLeg]) {
        self.meta = meta
        self.rates = rates
        self.segments = segments
        self.stays = stays
        self.transport = transport
    }
}

struct TripMeta: Codable, Sendable {
    var tripName: String?
    var travelers: Double?
    var baseCurrency: String = "HUF"
    var budgetCap: Double?
    var startDate: String?
    /// Open-ended trips have none.
    var endDate: String?
    /// "Budapest, Hungary"
    var homeBase: String?

    init(tripName: String? = nil, baseCurrency: String = "HUF", budgetCap: Double? = nil,
         startDate: String? = nil, endDate: String? = nil, homeBase: String? = nil) {
        self.tripName = tripName
        self.baseCurrency = baseCurrency
        self.budgetCap = budgetCap
        self.startDate = startDate
        self.endDate = endDate
        self.homeBase = homeBase
    }

    enum CodingKeys: String, CodingKey { case tripName, travelers, baseCurrency, budgetCap, startDate, endDate, homeBase }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        tripName = c.str(.tripName)
        travelers = c.num(.travelers)
        baseCurrency = c.str(.baseCurrency) ?? "HUF"
        budgetCap = c.num(.budgetCap)
        startDate = c.date(.startDate)
        endDate = c.date(.endDate)
        homeBase = c.str(.homeBase)
    }
}

/// A stop.
struct Segment: Codable, Sendable, Identifiable, Hashable {
    var id: String
    var country: String = ""
    var city: String = ""
    /// ISO YYYY-MM-DD.
    var arrive: String = ""
    /// Exclusive: the morning you leave.
    var depart: String = ""
    var nights: Double?
    /// false = a "maybe" stop; missing or true = in the plan.
    var include: Bool?
    var notes: String?
    /// Comfort: 0 budget, 1 mid, 2 comfort.
    var tier: Double?

    var inPlan: Bool { include != false }

    init(id: String, country: String, city: String, arrive: String, depart: String, nights: Double? = nil, include: Bool? = nil) {
        self.id = id
        self.country = country
        self.city = city
        self.arrive = arrive
        self.depart = depart
        self.nights = nights
        self.include = include
    }

    enum CodingKeys: String, CodingKey { case id, country, city, arrive, depart, nights, include, notes, tier }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.str(.id) ?? UUID().uuidString
        country = c.str(.country) ?? ""
        city = c.str(.city) ?? ""
        arrive = c.date(.arrive) ?? ""
        depart = c.date(.depart) ?? ""
        nights = c.num(.nights)
        include = c.bool(.include)
        notes = c.str(.notes)
        tier = c.num(.tier)
    }
}

struct Stay: Codable, Sendable, Identifiable, Hashable {
    var id: String
    var segId: String = ""
    var name: String = ""
    var platform: String?
    var cur: String = "HUF"
    /// Price per night, in `cur`.
    var ppn: Double = 0
    var nights: Double?
    var status: String?
    /// The tick: counts in the plan.
    var include: Bool?
    var chargeDate: String?
    var checkIn: String?
    /// Exclusive.
    var checkOut: String?
    var chargeAtCheckIn: Bool?
    var url: String?
    /// Free cancellation until; "" when there is none.
    var cancelUntil: String?
    var noFreeCancel: Bool?
    /// Remind before it turns non-refundable; missing means on.
    var remind: Bool?
    var notes: String?

    init(id: String, segId: String, name: String, platform: String? = nil, cur: String, ppn: Double,
         nights: Double? = nil, status: String? = nil, include: Bool? = nil, chargeDate: String? = nil,
         checkIn: String? = nil, checkOut: String? = nil, chargeAtCheckIn: Bool? = nil) {
        self.id = id
        self.segId = segId
        self.name = name
        self.platform = platform
        self.cur = cur
        self.ppn = ppn
        self.nights = nights
        self.status = status
        self.include = include
        self.chargeDate = chargeDate
        self.checkIn = checkIn
        self.checkOut = checkOut
        self.chargeAtCheckIn = chargeAtCheckIn
    }

    enum CodingKeys: String, CodingKey {
        case id, segId, name, platform, cur, ppn, nights, status, include, chargeDate, checkIn, checkOut, chargeAtCheckIn
        case url, cancelUntil, noFreeCancel, remind, notes
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.str(.id) ?? UUID().uuidString
        segId = c.str(.segId) ?? ""
        name = c.str(.name) ?? ""
        platform = c.str(.platform)
        cur = c.str(.cur) ?? "HUF"
        ppn = c.num(.ppn) ?? 0
        nights = c.num(.nights)
        status = c.str(.status)
        include = c.bool(.include)
        chargeDate = c.date(.chargeDate)
        checkIn = c.date(.checkIn)
        checkOut = c.date(.checkOut)
        chargeAtCheckIn = c.bool(.chargeAtCheckIn)
        url = c.str(.url)
        cancelUntil = c.date(.cancelUntil)
        noFreeCancel = c.bool(.noFreeCancel)
        remind = c.bool(.remind)
        notes = c.str(.notes)
    }
}

struct TransportLeg: Codable, Sendable, Identifiable, Hashable {
    var id: String
    /// flight, train, bus, ferry, or anything typed.
    var type: String = ""
    var from: String = ""
    var to: String = ""
    var date: String?
    var provider: String?
    var cur: String = "HUF"
    var price: Double = 0
    var status: String?
    var chargeDate: String?
    /// HH:MM
    var time: String?
    /// A connection city.
    var via: String?
    /// Total travel time.
    var hours: Double?
    var url: String?
    var notes: String?
    /// Unset counts as in the plan (spending.ts bookingsSummary).
    var include: Bool?

    init(id: String, type: String, from: String, to: String, date: String? = nil, cur: String, price: Double,
         status: String? = nil, chargeDate: String? = nil, time: String? = nil, via: String? = nil, hours: Double? = nil) {
        self.id = id
        self.type = type
        self.from = from
        self.to = to
        self.date = date
        self.cur = cur
        self.price = price
        self.status = status
        self.chargeDate = chargeDate
        self.time = time
        self.via = via
        self.hours = hours
    }

    enum CodingKeys: String, CodingKey { case id, type, from, to, date, provider, cur, price, status, chargeDate, time, via, hours, url, notes, include }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.str(.id) ?? UUID().uuidString
        type = c.str(.type) ?? ""
        from = c.str(.from) ?? ""
        to = c.str(.to) ?? ""
        date = c.date(.date)
        provider = c.str(.provider)
        cur = c.str(.cur) ?? "HUF"
        price = c.num(.price) ?? 0
        status = c.str(.status)
        chargeDate = c.date(.chargeDate)
        time = c.str(.time)
        via = c.str(.via)
        hours = c.num(.hours)
        url = c.str(.url)
        notes = c.str(.notes)
        include = c.bool(.include)
    }
}

// MARK: - forgiving decoding

/// A number that may arrive as a string.
struct LenientNumber: Decodable, Sendable {
    let value: Double?
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let d = try? c.decode(Double.self) { value = d }
        else if let s = try? c.decode(String.self) { value = Double(s) }
        else { value = nil }
    }
}

/// Decodes whatever it can and skips the rest, for list elements.
private struct Lossy<T: Decodable>: Decodable {
    let value: T?
    init(from decoder: Decoder) throws { value = try? T(from: decoder) }
}

extension KeyedDecodingContainer {
    func str(_ key: Key) -> String? {
        if let s = (try? decodeIfPresent(String.self, forKey: key)) ?? nil { return s }
        if let n = (try? decodeIfPresent(Double.self, forKey: key)) ?? nil {
            return n.rounded() == n ? String(Int(n)) : String(n)
        }
        return nil
    }

    func num(_ key: Key) -> Double? {
        if let d = (try? decodeIfPresent(Double.self, forKey: key)) ?? nil { return d }
        if let s = (try? decodeIfPresent(String.self, forKey: key)) ?? nil { return Double(s) }
        return nil
    }

    func bool(_ key: Key) -> Bool? {
        (try? decodeIfPresent(Bool.self, forKey: key)) ?? nil
    }

    /// An ISO date, cut to YYYY-MM-DD; an empty string reads as missing.
    func date(_ key: Key) -> String? {
        guard let s = str(key), !s.isEmpty else { return nil }
        return String(s.prefix(10))
    }

    func lossyList<T: Decodable>(_ key: Key) -> [T] {
        ((try? decodeIfPresent([Lossy<T>].self, forKey: key)) ?? nil)?.compactMap(\.value) ?? []
    }
}
