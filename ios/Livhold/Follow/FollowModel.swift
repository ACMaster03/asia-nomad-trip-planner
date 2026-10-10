import Foundation

// What a follower gets (migrations 33–35, 45, 46; /privacy): the journeys of the people
// they follow, as the sanitized projection sends them. Stops and dates, how they travel,
// check-ins and their comments. No prices, stays, booking details, notes or home.

struct Traveller: Codable, Hashable, Sendable {
    let id: String
    /// First name from the account, or "A traveller".
    let name: String
}

/// One person you follow, with the journeys of theirs open to followers (`my_following`).
struct FollowedPerson: Codable, Sendable {
    let user_id: String
    let name: String
    let trips: [FollowedTripCard]
}

struct FollowedTripCard: Codable, Hashable, Sendable {
    let trip_id: String
    let tripName: String?
    let startDate: String?
    let endDate: String?
    /// "on" or "paused": a journey closed to followers isn't listed at all.
    let state: String
    let travellers: [Traveller]?
    let currentCity: String?
    let lastEventAt: String?

    var paused: Bool { state == "paused" }
}

/// `followed_trip_summary`: null when you follow nobody on it any more.
struct FollowedSummary: Codable, Sendable {
    struct Stop: Codable, Hashable, Sendable {
        let city: String?
        let country: String?
        let arrive: String?
        let depart: String?
        let lat: Double?
        let lng: Double?
    }

    /// Only legs between two stops of the plan (46): never one from or to home.
    struct Leg: Codable, Hashable, Sendable {
        let from: String?
        let to: String?
        let date: String?
        /// flight, train, bus, ferry or other (45).
        let mode: String?
    }

    var tripName: String?
    var startDate: String?
    var endDate: String?
    var route: [Stop]?
    var legs: [Leg]?
    var travellers: [Traveller]?
    /// Every traveller paused it: only the name comes.
    var paused: Bool?
}

/// A post a follower may see (`following_feed`, `_event_row_json`).
struct FollowedEvent: Codable, Hashable, Identifiable, Sendable {
    struct Payload: Codable, Hashable, Sendable {
        var placeName: String?
        var text: String?
        var city: String?
        var photos: [String]?
    }

    let id: String
    /// checkin, arrived, note, media or location.
    let kind: String
    let occurred_at: String
    let author: String?
    let authorName: String?
    let payload: Payload?
    let rating: Int?
    let comment: String?
    let trip_id: String
    let tripName: String?

    var isCheckIn: Bool { kind == "checkin" }
    var isArrival: Bool { kind == "arrived" }
    var at: Date { FollowDates.instant(occurred_at) ?? .distantPast }
    /// The day it happened on this phone's calendar, "2026-10-09".
    var day: String { FollowDates.day(at) }
    var place: String { payload?.placeName ?? "" }
    var city: String { payload?.city ?? "" }
}

/// One comment under a post (`event_comments_list`, `add_comment`).
struct FollowComment: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let parent_id: String?
    let author: String?
    let authorName: String?
    let isTraveller: Bool?
    let body: String
    let deleted: Bool?
    let created_at: String
}

enum FollowDates {
    // ISO8601DateFormatter is thread-safe; nothing changes them after this.
    nonisolated(unsafe) private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    nonisolated(unsafe) private static let plain = ISO8601DateFormatter()

    /// Postgres sends microseconds ("…40.658843+00:00"); cut to milliseconds first,
    /// which the formatter reads on every iOS version.
    static func instant(_ s: String) -> Date? {
        var t = s
        if let dot = t.firstIndex(of: "."),
           let end = t[dot...].firstIndex(where: { $0 == "+" || $0 == "-" || $0 == "Z" }),
           t.distance(from: dot, to: end) > 4 {
            t.removeSubrange(t.index(dot, offsetBy: 4)..<end)
        }
        return withFraction.date(from: t) ?? plain.date(from: t)
    }

    static func day(_ d: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// The phone's clock; with `-fixtureToday` (debug), that day at the same time.
    static var now: Date {
        let real = Date.now
        let today = Days.today()
        let ymd = today.split(separator: "-").compactMap { Int($0) }
        guard today != day(real), ymd.count == 3 else { return real }
        let c = Calendar.current.dateComponents([.hour, .minute], from: real)
        var lc = DateComponents(year: ymd[0], month: ymd[1], day: ymd[2])
        lc.hour = c.hour
        lc.minute = c.minute
        return Calendar.current.date(from: lc) ?? real
    }

    /// "just now", "2 hours ago", "yesterday", "9 Oct".
    static func when(_ d: Date, now: Date = FollowDates.now) -> String {
        let secs = now.timeIntervalSince(d)
        if secs < 90 { return String(localized: "just now") }
        if secs < 20 * 3600 {
            let f = RelativeDateTimeFormatter()
            f.locale = L10n.locale
            f.unitsStyle = .full
            return f.localizedString(for: d, relativeTo: now)
        }
        if Calendar.current.isDateInYesterday(d) { return String(localized: "yesterday") }
        return Days.short(day(d))
    }
}

/// A followed journey put together for the screen: its stops in date order, with the
/// check-ins of each under it.
struct FollowedJourney: Equatable {
    let tripId: String
    let name: String
    let travellers: [Traveller]
    let paused: Bool
    /// The stops as segments, so Trip's date logic reads them as your own (`stop-f0`, …).
    let state: TripState
    let route: [FollowedSummary.Stop]
    let legs: [FollowedSummary.Leg]
    /// This journey's posts, newest first.
    let events: [FollowedEvent]

    init(tripId: String, summary: FollowedSummary, events: [FollowedEvent]) {
        self.tripId = tripId
        name = summary.tripName ?? ""
        travellers = summary.travellers ?? []
        paused = summary.paused == true
        route = (summary.route ?? []).filter { !($0.city ?? "").isEmpty }
        legs = summary.legs ?? []
        self.events = events.filter { $0.trip_id == tripId }.sorted { $0.at > $1.at }
        let segs = route.enumerated().map { i, s in
            Segment(id: "f\(i)", country: s.country ?? "", city: s.city ?? "", arrive: s.arrive ?? "", depart: s.depart ?? "")
        }
        state = TripState(meta: TripMeta(tripName: summary.tripName, startDate: summary.startDate, endDate: summary.endDate),
                          rates: [:], segments: segs, stays: [], transport: [])
    }

    static func == (a: Self, b: Self) -> Bool {
        a.tripId == b.tripId && a.name == b.name && a.paused == b.paused && a.route == b.route
            && a.legs == b.legs && a.events == b.events && a.travellers == b.travellers
    }

    var stops: [Segment] { state.segments }

    /// "Patrik and Petra", "Patrik, Petra and Anna".
    var who: String { Self.names(travellers.map(\.name)) }

    static func names(_ list: [String]) -> String {
        guard list.count > 1 else { return list.first ?? "" }
        return String(localized: "\(list.dropLast().joined(separator: ", ")) and \(list.last!)")
    }

    /// The leg into stop `i` as the travellers typed it, if any.
    func leg(into i: Int) -> FollowedSummary.Leg? {
        guard i > 0, i < stops.count else { return nil }
        let a = stops[i - 1].city, b = stops[i].city
        return legs.first { Journey.sameCity($0.from, a) && Journey.sameCity($0.to, b) }
    }

    /// Which stop a post belongs to. An arrival names its city. A check-in goes by its
    /// day; on a travel day, one posted before that day's arrival is the stop before.
    func stopIndex(of e: FollowedEvent) -> Int? {
        if e.isArrival {
            return stops.lastIndex { Journey.sameCity($0.city, e.city) }
        }
        let day = e.day
        guard var i = stops.lastIndex(where: { !$0.arrive.isEmpty && $0.arrive <= day && (day < $0.depart || $0.depart.isEmpty) })
                ?? stops.lastIndex(where: { !$0.arrive.isEmpty && $0.arrive <= day })
        else { return stops.isEmpty ? nil : 0 }
        if i > 0, stops[i].arrive == day,
           let arrived = events.first(where: { $0.isArrival && Journey.sameCity($0.city, stops[i].city) }),
           arrived.day == day, e.at < arrived.at {
            i -= 1
        }
        return i
    }

    /// Check-ins under stop `i`, newest first.
    func checkIns(at i: Int) -> [FollowedEvent] {
        events.filter { $0.isCheckIn && stopIndex(of: $0) == i }
    }

    func arrival(at i: Int) -> FollowedEvent? {
        events.first { $0.isArrival && stopIndex(of: $0) == i }
    }

    var latestCheckIn: FollowedEvent? { events.first(where: \.isCheckIn) }
    var latestArrival: FollowedEvent? { events.first(where: \.isArrival) }

    /// "Hanoi, day 41 · next Da Nang, 13 Nov"
    func line(today: String) -> String {
        let meta = state.meta
        if let start = meta.startDate, today < start {
            return String(localized: "Leaves \(Days.short(start))")
        }
        if let end = meta.endDate, today > end { return String(localized: "Home again") }
        let day = Journey.tripDay(meta, today: today)
        let cur = Journey.current(in: state, today: today)
        let next = stops.first { $0.arrive > today }
        var parts: [String] = []
        if let cur, let day {
            parts.append(String(localized: "\(cur.city), day \(day)"))
        } else if let day {
            parts.append(String(localized: "Day \(day) · between stops"))
        }
        if let cur, cur.arrive == today, let arr = arrival(at: stops.firstIndex(of: cur) ?? -1),
           arr.day == today {
            if let mode = leg(into: stops.firstIndex(of: cur) ?? 0)?.mode, let how = Self.by(mode) {
                parts.append(String(localized: "arrived today \(how)"))
            } else {
                parts.append(String(localized: "arrived today"))
            }
        } else if let next {
            parts.append(String(localized: "next \(next.city), \(Days.short(next.arrive))"))
        }
        return parts.joined(separator: " · ")
    }

    /// "by train"; nil for "other".
    static func by(_ mode: String) -> String? {
        switch mode {
        case "flight": String(localized: "by plane")
        case "train": String(localized: "by train")
        case "bus": String(localized: "by bus")
        case "ferry": String(localized: "by ferry")
        default: nil
        }
    }

    /// Live: today falls within the journey's dates.
    func isLive(today: String) -> Bool {
        guard !paused, let start = state.meta.startDate, !start.isEmpty, start <= today else { return false }
        if let end = state.meta.endDate, !end.isEmpty, today > end { return false }
        return true
    }
}
