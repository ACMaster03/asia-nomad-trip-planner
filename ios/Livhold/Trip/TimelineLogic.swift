import Foundation

// The web's Trip timeline rules, ported one to one so both apps say the same
// thing about the same journey. Sources: product/src/lib/trips/timeline.ts,
// format.ts, progress.ts, commitment.ts, whereAmI.ts, lib/map/norm.ts and
// components/trips/sheetKit.tsx. Change a rule there, change it here.
//
// Dates stay ISO strings (YYYY-MM-DD) and compare as strings, as on the web;
// "today" is the phone's local calendar date.

enum Days {
    private static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()

    private static let parser: DateFormatter = {
        let f = DateFormatter()
        f.calendar = calendar
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func date(_ iso: String) -> Date? { iso.isEmpty ? nil : parser.date(from: String(iso.prefix(10))) }

    /// The phone's calendar date — the viewer's clock, not UTC (format.ts localISODate).
    static func today(_ now: Date = .now) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: now)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    static func add(_ iso: String, _ n: Int) -> String {
        guard let d = date(iso), let r = calendar.date(byAdding: .day, value: n, to: d) else { return iso }
        return parser.string(from: r)
    }

    /// Whole nights from a to b; 0 when either is missing or b is not after a.
    static func between(_ a: String?, _ b: String?) -> Int {
        guard let a, let b, let da = date(a), let db = date(b) else { return 0 }
        let n = (db.timeIntervalSince(da) / 86_400).rounded()
        return n > 0 ? Int(n) : 0
    }

    /// "24 Nov" (timeline.ts shortDate); "—" when missing (sheetKit fmtDay).
    static func short(_ iso: String?) -> String {
        guard let iso, let d = date(iso) else { return "—" }
        let c = calendar.dateComponents([.day, .month], from: d)
        let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        return "\(c.day ?? 0) \(months[(c.month ?? 1) - 1])"
    }

    /// 14.58 → "14 h 35" (sheetKit fmtHours).
    static func hours(_ h: Double) -> String {
        let whole = Int(h.rounded(.down))
        let mins = Int(((h - Double(whole)) * 60).rounded())
        return mins > 0 ? "\(whole) h \(String(format: "%02d", mins))" : "\(whole) h"
    }
}

enum Journey {
    // MARK: stops and nights

    /// A stop's nights: its typed count, else the dates between (format.ts segNights).
    static func nights(_ s: Segment) -> Int {
        if let n = s.nights { return Int(n) }
        return Days.between(s.arrive, s.depart)
    }

    /// "Budapest, Hungary" → "Budapest".
    static func homeCity(_ homeBase: String?) -> String {
        (homeBase ?? "").split(separator: ",", maxSplits: 1).first.map { $0.trimmingCharacters(in: .whitespaces) } ?? ""
    }

    /// arrive ≤ today < depart: departure day belongs to the next stop.
    static func isCurrent(_ s: Segment, today: String) -> Bool {
        s.inPlan && !s.arrive.isEmpty && !s.depart.isEmpty && s.arrive <= today && today < s.depart
    }

    static func current(in state: TripState, today: String) -> Segment? {
        state.segments.first { isCurrent($0, today: today) }
    }

    /// 1-based trip day; nil before departure or without a start date (progress.ts tripDay).
    static func tripDay(_ meta: TripMeta, today: String) -> Int? {
        guard let start = meta.startDate, today >= start else { return nil }
        return Days.between(start, today) + 1
    }

    struct StopProgress { let night: Int; let nights: Int; let left: Int; let fraction: Double }

    static func progress(_ s: Segment, today: String) -> StopProgress {
        let n = max(nights(s), 1)
        let night = min(max(Days.between(s.arrive, today) + 1, 1), n)
        return StopProgress(night: night, nights: n, left: n - night, fraction: min(1, Double(night) / Double(n)))
    }

    /// "Day 12 · Da Lat, night 3", "Leaves 31 Aug", "Home again" (Timeline.tsx kicker).
    static func kicker(_ state: TripState, today: String) -> String {
        let meta = state.meta
        guard let day = tripDay(meta, today: today) else {
            return meta.startDate.map { "Leaves \(Days.short($0))" } ?? ""
        }
        if let end = meta.endDate, today > end { return "Home again" }
        if let cur = current(in: state, today: today) {
            return "Day \(day) · \(cur.city), night \(progress(cur, today: today).night)"
        }
        return "Day \(day) · between stops"
    }

    // MARK: city names

    /// Drop a " (…)" suffix, trim, lowercase (norm.ts normCity).
    static func normCity(_ s: String?) -> String {
        let base = (s ?? "").components(separatedBy: " (").first ?? ""
        return base.trimmingCharacters(in: .whitespaces).lowercased()
    }

    /// "Hong Kong" and "Hong Kong Island" are the same place; "York" is not "New York".
    static func sameCity(_ a: String?, _ b: String?) -> Bool {
        let x = normCity(a), y = normCity(b)
        guard !x.isEmpty, !y.isEmpty else { return false }
        return x == y || x.hasPrefix(y + " ") || y.hasPrefix(x + " ")
    }

    // MARK: money

    /// Booked or chosen means the booking exists (commitment.ts).
    static func isBooked(_ status: String?) -> Bool {
        ["booked", "chosen"].contains((status ?? "").lowercased())
    }

    /// An amount in `cur` in the trip's base currency.
    static func toBase(_ amount: Double, _ cur: String, _ rates: [String: Double]) -> Double {
        amount * (rates[cur] ?? 0)
    }

    /// "1 234 567 Ft", "$1,234", "€1,234" — whole units, narrow symbols (format.ts fmtMoney).
    static func money(_ n: Double, _ currency: String) -> String {
        let locale = Locale(identifier: currency == "HUF" ? "hu_HU" : "en_US")
        return n.rounded().formatted(
            .currency(code: currency).presentation(.narrow).precision(.fractionLength(0)).locale(locale)
        )
    }

    enum Tone { case ok, warn, muted }
    struct MoneyState { let label: String; let tone: Tone }

    /// The money line on a leg strip (timeline.ts legMoneyState).
    static func legMoney(_ t: TransportLeg, today: String) -> MoneyState {
        guard isBooked(t.status) else { return MoneyState(label: t.price > 0 ? "idea" : "idea · no price", tone: .muted) }
        guard let date = t.chargeDate ?? t.date else { return MoneyState(label: "booked", tone: .ok) }
        return date <= today
            ? MoneyState(label: "paid \(Days.short(date))", tone: .ok)
            : MoneyState(label: "will be charged on \(Days.short(date))", tone: .warn)
    }

    /// The money line under a stay row (timeline.ts stayMoneyState).
    static func stayMoney(_ st: Stay, today: String) -> MoneyState {
        guard isBooked(st.status) else { return MoneyState(label: st.ppn > 0 ? "idea" : "idea · no price", tone: .muted) }
        if let charge = st.chargeDate {
            return charge <= today
                ? MoneyState(label: "paid \(Days.short(charge))", tone: .ok)
                : MoneyState(label: "will be charged on \(Days.short(charge))", tone: .warn)
        }
        if st.chargeAtCheckIn == true { return MoneyState(label: "will be charged at check-in", tone: .warn) }
        return MoneyState(label: "deadlines not set", tone: .warn)
    }

    // MARK: stays

    /// A stay's name without the stop's city in front ("Bangkok – Home in Khet
    /// Huai Khwang" under Bangkok reads "Home in Khet Huai Khwang").
    static func stayName(_ st: Stay, in seg: Segment) -> String {
        let name = st.name.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return "Stay" }
        let city = seg.city.trimmingCharacters(in: .whitespaces)
        guard !city.isEmpty, name.lowercased().hasPrefix(city.lowercased()) else { return name }
        let rest = name.dropFirst(city.count)
        let separators = CharacterSet(charactersIn: " -–—:,·|/")
        guard let first = rest.unicodeScalars.first, separators.contains(first) else { return name }
        let trimmed = rest.trimmingCharacters(in: separators)
        return trimmed.isEmpty ? name : trimmed
    }

    struct NightRange: Hashable { let from: String; let to: String; let nights: Int }

    private static func range(_ from: String, _ to: String) -> NightRange {
        NightRange(from: from, to: to, nights: Days.between(from, to))
    }

    /// A stay's nights (format.ts stayNights).
    static func stayNights(_ st: Stay, _ seg: Segment?) -> Int {
        if let ci = st.checkIn, let co = st.checkOut { return Days.between(ci, co) }
        if let n = st.nights { return Int(n) }
        return seg.map(nights) ?? 0
    }

    static func stayTotal(_ st: Stay, _ seg: Segment?) -> Double {
        st.ppn * Double(stayNights(st, seg))
    }

    /// The nights a stay covers (timeline.ts stayRange).
    static func stayRange(_ st: Stay, _ seg: Segment) -> NightRange? {
        if let ci = st.checkIn, let co = st.checkOut, co > ci { return range(ci, co) }
        guard !seg.arrive.isEmpty, !seg.depart.isEmpty, seg.depart > seg.arrive else { return nil }
        if let n = st.nights, n > 0 {
            return NightRange(from: seg.arrive, to: Days.add(seg.arrive, Int(n)), nights: Int(n))
        }
        return NightRange(from: seg.arrive, to: seg.depart, nights: nights(seg))
    }

    struct Coverage {
        var covered: [(stay: Stay, range: NightRange)] = []
        /// Nights no counted stay covers: the amber "No bed" rows.
        var gaps: [NightRange] = []
        /// Nights two counted stays both claim.
        var overlaps: [NightRange] = []
    }

    /// timeline.ts stopCoverage.
    static func coverage(_ seg: Segment, _ stays: [Stay]) -> Coverage {
        var cov = Coverage()
        cov.covered = stays
            .filter { $0.include == true }
            .compactMap { st in stayRange(st, seg).map { (stay: st, range: $0) } }
            .sorted { ($0.range.from, $0.range.to) < ($1.range.from, $1.range.to) }
        guard !cov.covered.isEmpty, !seg.arrive.isEmpty, !seg.depart.isEmpty, seg.depart > seg.arrive else { return cov }
        var cursor = seg.arrive
        var first = true
        for (_, r) in cov.covered {
            if r.from > cursor && cursor < seg.depart {
                let g = range(cursor, r.from < seg.depart ? r.from : seg.depart)
                if g.nights > 0 { cov.gaps.append(g) }
            } else if !first && r.from < cursor {
                let o = range(r.from, r.to < cursor ? r.to : cursor)
                if o.nights > 0 { cov.overlaps.append(o) }
            }
            if r.to > cursor { cursor = r.to }
            first = false
        }
        if cursor < seg.depart { cov.gaps.append(range(cursor, seg.depart)) }
        return cov
    }

    // MARK: the timeline

    struct LegEnd: Hashable {
        enum Kind { case home, stop }
        let kind: Kind
        let city: String
        let seg: Segment?
        var id: String { kind == .home ? "home" : (seg?.id ?? city) }
    }

    struct Leg: Identifiable, Hashable {
        var id: String { "\(from.id)->\(to.id)" }
        let index: Int
        let from: LegEnd
        let to: LegEnd
        /// The day it happens: the departure of the stop it leaves, or the first stop's arrival.
        let date: String
        /// Every entry on this leg, booked first.
        var transport: [TransportLeg] = []
        var booked: TransportLeg? { transport.first { isBooked($0.status) } }
        var wayHome: Bool { to.kind == .home }
    }

    struct Timeline {
        let home: String
        /// In-plan stops in date order.
        let stops: [Segment]
        let legs: [Leg]
        /// Transport whose from/to match no leg.
        let orphans: [TransportLeg]
        /// "Maybe" stops, placed by date and shown faded, with no legs.
        let maybes: [Segment]
    }

    /// timeline.ts buildTimeline.
    static func timeline(_ state: TripState) -> Timeline {
        let home = homeCity(state.meta.homeBase)
        let byArrive: (Segment, Segment) -> Bool = { a, b in
            let ta = Days.date(a.arrive) ?? .distantFuture
            let tb = Days.date(b.arrive) ?? .distantFuture
            return ta < tb
        }
        let stops = state.segments.filter(\.inPlan).sorted(by: byArrive)
        var ends: [LegEnd] = []
        if !home.isEmpty { ends.append(LegEnd(kind: .home, city: home, seg: nil)) }
        ends += stops.map { LegEnd(kind: .stop, city: $0.city, seg: $0) }
        if !home.isEmpty, !stops.isEmpty { ends.append(LegEnd(kind: .home, city: home, seg: nil)) }

        var legs: [Leg] = []
        if ends.count > 1 {
            for i in 0..<(ends.count - 1) {
                let from = ends[i], to = ends[i + 1]
                let date = from.kind == .stop ? (from.seg?.depart ?? "") : (to.seg?.arrive ?? "")
                legs.append(Leg(index: legs.count + 1, from: from, to: to, date: date))
            }
        }
        var orphans: [TransportLeg] = []
        for t in state.transport {
            if let i = legs.firstIndex(where: { sameCity($0.from.city, t.from) && sameCity($0.to.city, t.to) }) {
                legs[i].transport.append(t)
            } else {
                orphans.append(t)
            }
        }
        for i in legs.indices {
            // Booked first, otherwise in the order they were entered (a stable sort, like JS).
            legs[i].transport = legs[i].transport.enumerated()
                .sorted { a, b in
                    let ba = isBooked(a.element.status), bb = isBooked(b.element.status)
                    return ba != bb ? ba : a.offset < b.offset
                }
                .map(\.element)
        }
        let maybes = state.segments.filter { !$0.inPlan }.sorted { $0.arrive < $1.arrive }
        return Timeline(home: home, stops: stops, legs: legs, orphans: orphans, maybes: maybes)
    }

    /// The rail top to bottom (Timeline.tsx railRows, without the editor's "+ Add stop").
    enum Row: Identifiable {
        case home(start: Bool)
        case leg(Leg)
        case stop(Segment, maybe: Bool)

        var id: String {
            switch self {
            case .home(let start): start ? "home-start" : "home-end"
            case .leg(let leg): "leg-" + leg.id
            case .stop(let s, _): "stop-" + s.id
            }
        }
    }

    static func rows(_ tl: Timeline) -> [Row] {
        var out: [Row] = [.home(start: true)]
        if let first = tl.legs.first {
            if first.from.kind == .stop, let s = first.from.seg { out.append(.stop(s, maybe: false)) }
            for leg in tl.legs {
                out.append(.leg(leg))
                if leg.to.kind == .stop, let s = leg.to.seg { out.append(.stop(s, maybe: false)) }
            }
        } else {
            out += tl.stops.map { .stop($0, maybe: false) }
        }
        if !tl.stops.isEmpty { out.append(.home(start: false)) }
        for m in tl.maybes {
            // Where its dates put it; past the last stop it goes where the web's
            // "+ Add stop" sits: before the way home.
            let idx = out.firstIndex {
                if case .stop(let s, let maybe) = $0 { return !maybe && s.arrive > m.arrive }
                return false
            } ?? out.firstIndex {
                if case .leg(let leg) = $0 { return leg.wayHome }
                return false
            } ?? out.firstIndex {
                if case .home(false) = $0 { return true }
                return false
            } ?? out.count
            out.insert(.stop(m, maybe: true), at: idx)
        }
        return out
    }
}
