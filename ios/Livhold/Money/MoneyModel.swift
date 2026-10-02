import Foundation

// The web's Money numbers, ported one to one so both apps say the same thing
// about the same journey. Sources: product/src/lib/trips/moneyModel.ts,
// spending.ts (burnRate, tripPace, planByStop, bookingsSummary, projectFromPlan,
// beyondEveryday, dailySpend, spendByCategory), unlocks.ts, budget.ts.
// Change a rule there, change it here.

/// Whether an entry counts in the daily pace (spending.ts isEverydayRow).
/// Imported rows never do; the entry's own switch wins where it may.
func isEverydayRow(_ e: LedgerEntry) -> Bool {
    guard e.source == nil else { return false }
    if Categories.switchable(e.category), let own = e.everyday { return own }
    return Categories.isEveryday(e.category)
}

struct MoneyModel {
    struct Pace {
        enum Scope { case stop, trip, none }
        let perDay: Double?
        let days: Int
        let scope: Scope
    }

    struct PlanRow: Identifiable {
        enum StayLabel { case booked, unpaid, draft, estimate, none }
        let seg: Segment
        let nights: Int
        let nightsIn: Int
        let remaining: Int
        /// Everyday spending logged at this stop so far.
        let spent: Double
        let rate: Double
        let fromPace: Bool
        let stay: Double
        let stayLabel: StayLabel
        var projected: Double { stay + spent + Double(remaining) * rate }
        var id: String { seg.id }
    }

    struct BookingRow: Identifiable {
        enum Status { case paid, unpaid, unbooked }
        let id: String
        let isStay: Bool
        let label: String
        let amount: Double
        let date: String?
        let status: Status
    }

    struct Bookings {
        let stays: [BookingRow]
        let transport: [BookingRow]
        var all: [BookingRow] { stays + transport }
        var total: Double { all.reduce(0) { $0 + $1.amount } }
        var toPay: Double { all.filter { $0.status == .unpaid }.reduce(0) { $0 + $1.amount } }
        var notBooked: Double { all.filter { $0.status == .unbooked }.reduce(0) { $0 + $1.amount } }
        func paid(before today: String) -> Double {
            all.filter { $0.status == .paid && ($0.date ?? "") <= today }.reduce(0) { $0 + $1.amount }
        }
        func scheduled(after today: String) -> Double {
            all.filter { $0.status == .paid && ($0.date ?? "") > today }.reduce(0) { $0 + $1.amount }
        }
    }

    struct Projection {
        let spent: Double
        let scheduled: Double
        let ahead: Double
        let unpaidStays: Double
        let transportToPay: Double
        let subsAhead: Double
        let remainingNights: Int
        /// Days between the last planned stop and the journey's end, at the daily
        /// pace plus the average night's stay so far (Patrik, 29 Sep: the cap is for
        /// the whole journey, so what it's compared with has to be too).
        let unplannedDays: Int
        let unplanned: Double
        var daysAhead: Int { remainingNights + unplannedDays }
        var projected: Double { spent + scheduled + ahead + unpaidStays + transportToPay + subsAhead + unplanned }
    }

    struct BeyondRow: Identifiable {
        let id: String
        let label: String
        let category: String
        let total: Double
    }

    struct Unlocks {
        var chart = false, range = false, whereItGoes = false, projection = false
        var beyond = false
        var firstEveryday: String?
    }

    struct Day: Identifiable {
        let date: String
        var byFamily: [Family: Double] = [:]
        var total: Double { byFamily.values.reduce(0, +) }
        var id: String { date }
    }

    struct CategoryTotal: Identifiable {
        let category: String
        let total: Double
        let count: Int
        var id: String { category }
    }

    let today: String
    let base: String
    let rates: [String: Double]
    let state: TripState
    let ledger: [LedgerEntry]
    let current: Segment?
    let pace: Pace
    let plan: [PlanRow]
    let bookings: Bookings
    let projection: Projection
    let beyondTotal: Double
    let beyondRows: [BeyondRow]
    let unlocks: Unlocks
    let subscriptions: [Subscription]
    let tripStart: String?
    let tripEnd: String?

    var cap: Double? { (state.meta.budgetCap ?? 0) > 0 ? state.meta.budgetCap : nil }
    var tripDay: Int? { Journey.tripDay(state.meta, today: today) }

    init(trip: TripRow, ledger: [LedgerEntry], cities: [String: CityCost], today: String) {
        let state = trip.state
        self.today = today
        self.state = state
        self.ledger = ledger
        base = state.meta.baseCurrency
        var rates = state.rates
        rates[base] = 1
        self.rates = rates
        tripStart = state.meta.startDate
        let included = state.segments.filter(\.inPlan)
        tripEnd = state.meta.endDate ?? included.map(\.depart).filter { !$0.isEmpty }.max()

        // moneyModel.ts currentStop: arrive ≤ today ≤ depart, earliest arrival first.
        current = included
            .filter { !$0.arrive.isEmpty && !$0.depart.isEmpty }
            .sorted { $0.arrive < $1.arrive }
            .first { $0.arrive <= today && today <= $0.depart }

        subscriptions = {
            guard case .array(let items)? = trip.rawState["subscriptions"] else { return [] }
            return items.compactMap(Subscription.init(raw:))
        }()

        let pace = Self.tripPace(ledger, rates, current: current, start: tripStart, today: today)
        self.pace = pace
        let plan = Self.planByStop(state, ledger, rates, cities: cities, today: today, pace: pace.perDay)
        self.plan = plan
        let bookings = Self.bookingsSummary(state, ledger, rates)
        self.bookings = bookings

        var subsAhead = 0.0
        if let end = tripEnd {
            let from = Days.add(today, 1)
            for sub in subscriptions {
                subsAhead += Double(Subscriptions.charges(sub, from: from, to: end).count) * Journey.toBase(sub.amount, sub.cur, rates)
            }
        }

        // The days no stop covers yet: everyday at the pace (or the plan's own rate
        // before there is one), and a night at what the planned stays average.
        var unplannedDays = 0
        if let end = tripEnd {
            let lastDepart = included.map(\.depart).filter { !$0.isEmpty }.max() ?? today
            let from = max(lastDepart, today)
            if end > from { unplannedDays = Days.between(from, end) }
        }
        let plannedNights = plan.reduce(0) { $0 + $1.nights }
        let dayRate = pace.perDay
            ?? (plannedNights > 0 ? plan.reduce(0.0) { $0 + $1.rate * Double($1.nights) } / Double(plannedNights) : 0)
        let stayed = plan.filter { $0.stay > 0 && $0.nights > 0 }
        let stayNights = stayed.reduce(0) { $0 + $1.nights }
        let nightRate = stayNights > 0 ? stayed.reduce(0.0) { $0 + $1.stay } / Double(stayNights) : 0

        let expenses = ledger.filter { $0.isExpense && !$0.date.isEmpty }
        let settled = expenses.filter { $0.date <= today }
        let spent = settled.reduce(0) { $0 + Journey.toBase($1.amount, $1.currency, rates) }
        let scheduled = expenses.filter { $0.date > today }.reduce(0) { $0 + Journey.toBase($1.amount, $1.currency, rates) }
        projection = Projection(
            spent: spent,
            scheduled: scheduled,
            ahead: plan.reduce(0) { $0 + Double($1.remaining) * $1.rate },
            unpaidStays: plan.filter { $0.stayLabel != .booked }.reduce(0) { $0 + $1.stay },
            transportToPay: bookings.transport.filter { $0.status == .unpaid }.reduce(0) { $0 + $1.amount },
            subsAhead: subsAhead,
            remainingNights: plan.reduce(0) { $0 + $1.remaining },
            unplannedDays: unplannedDays,
            unplanned: Double(unplannedDays) * (dayRate + nightRate)
        )

        // beyondEveryday
        let everydaySettled = settled.filter(isEverydayRow)
        beyondTotal = spent - everydaySettled.reduce(0) { $0 + Journey.toBase($1.amount, $1.currency, rates) }
        var rows: [String: BeyondRow] = [:]
        for e in settled where !isEverydayRow(e) {
            let own = Categories.isEveryday(e.category) && e.source == nil
            let key = own ? "entry:\(e.id)" : e.category
            let prev = rows[key]?.total ?? 0
            rows[key] = BeyondRow(id: key, label: own ? (e.note.isEmpty ? Categories.label(e.category) : e.note) : Categories.label(e.category),
                                  category: e.category, total: prev + Journey.toBase(e.amount, e.currency, rates))
        }
        beyondRows = rows.values.sorted { $0.total > $1.total }

        unlocks = Self.unlocks(trip: trip, settled: settled, pace: pace, tripStart: tripStart)
    }

    // MARK: pace

    /// Everyday spending over [from, to], both days counted; days with nothing logged count too.
    static func burnRate(_ ledger: [LedgerEntry], _ rates: [String: Double], from: String, to: String) -> (total: Double, days: Int, perDay: Double) {
        let days = Days.between(from, to) + 1
        let total = ledger
            .filter { $0.isExpense && !$0.date.isEmpty && $0.date >= from && $0.date <= to && isEverydayRow($0) }
            .reduce(0) { $0 + Journey.toBase($1.amount, $1.currency, rates) }
        return (total, days, days > 0 ? total / Double(days) : 0)
    }

    static func tripPace(_ ledger: [LedgerEntry], _ rates: [String: Double], current: Segment?, start: String?, today: String) -> Pace {
        if let cur = current, cur.arrive <= today {
            let r = burnRate(ledger, rates, from: cur.arrive, to: min(today, cur.depart))
            if r.days >= 3 { return Pace(perDay: r.perDay, days: r.days, scope: .stop) }
        }
        if let start, start <= today {
            let r = burnRate(ledger, rates, from: start, to: today)
            if r.days >= 3 { return Pace(perDay: r.perDay, days: r.days, scope: .trip) }
        }
        return Pace(perDay: nil, days: 0, scope: .none)
    }

    // MARK: plan

    static func planByStop(_ state: TripState, _ ledger: [LedgerEntry], _ rates: [String: Double],
                           cities: [String: CityCost], today: String, pace: Double?) -> [PlanRow] {
        let usd = rates["USD"] ?? 0
        return state.segments.filter(\.inPlan).map { seg in
            let nights = Journey.nights(seg)
            let tier = min(2, max(0, Int(seg.tier ?? 1)))
            let city = cities[seg.city]
            let started = !seg.arrive.isEmpty && seg.arrive <= today
            let nightsIn = started ? min(nights, Days.between(seg.arrive, today) + 1) : 0
            let spent = started ? burnRate(ledger, rates, from: seg.arrive, to: seg.depart.isEmpty ? today : min(today, seg.depart)).total : 0
            let live = city.map { $0.live[tier] * usd * Double(nights) } ?? 0
            let rate = pace ?? (nights > 0 ? live / Double(nights) : 0)

            let stays = state.stays.filter { $0.segId == seg.id && $0.include == true }
            var stay = 0.0
            var label = PlanRow.StayLabel.none
            if !stays.isEmpty {
                stay = stays.reduce(0) { $0 + Journey.toBase(Journey.stayTotal($1, seg), $1.cur, rates) }
                let booked = stays.filter { Journey.isBooked($0.status) }
                if booked.isEmpty {
                    label = .draft
                } else {
                    let paid = booked.allSatisfy { st in ledger.contains { $0.source?.key == "stay:\(st.id)" } }
                    label = paid ? .booked : .unpaid
                }
            } else if let city {
                stay = city.accom[tier] * usd * Double(nights)
                label = .estimate
            }
            return PlanRow(seg: seg, nights: nights, nightsIn: nightsIn, remaining: max(0, nights - nightsIn),
                           spent: spent, rate: rate, fromPace: pace != nil, stay: stay, stayLabel: label)
        }
    }

    // MARK: bookings

    static func bookingsSummary(_ state: TripState, _ ledger: [LedgerEntry], _ rates: [String: Double]) -> Bookings {
        let paidKeys = Set(ledger.compactMap { $0.source?.key })
        func status(_ booked: Bool, _ key: String) -> BookingRow.Status {
            !booked ? .unbooked : (paidKeys.contains(key) ? .paid : .unpaid)
        }
        let segs = Dictionary(state.segments.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let stays = state.stays.filter { $0.include == true }.map { st in
            BookingRow(id: st.id, isStay: true, label: st.name,
                       amount: Journey.toBase(Journey.stayTotal(st, segs[st.segId]), st.cur, rates),
                       date: st.chargeDate, status: status(Journey.isBooked(st.status), "stay:\(st.id)"))
        }
        let transport = state.transport.filter { $0.include != false }.map { t in
            BookingRow(id: t.id, isStay: false, label: "\(t.type) \(t.from) → \(t.to)",
                       amount: Journey.toBase(t.price, t.cur, rates),
                       // Dated like its entry in All entries: when the card was charged,
                       // else the travel date. The travel date alone called a flight paid
                       // in September "scheduled" until December (Patrik, 29 Sep).
                       date: [t.chargeDate, t.date].compactMap { $0 }.first { !$0.isEmpty },
                       status: status(Journey.isBooked(t.status), "transport:\(t.id)"))
        }
        return Bookings(stays: stays, transport: transport)
    }

    // MARK: unlocks

    /// Journeys created before round 2 shipped keep every card (unlocks.ts LEGACY).
    private static let round2Shipped = ISO8601DateFormatter().date(from: "2026-09-23T09:45:00Z")!

    static func unlocks(trip: TripRow, settled: [LedgerEntry], pace: Pace, tripStart: String?) -> Unlocks {
        var u = Unlocks()
        let everyday = settled.filter(isEverydayRow)
        let days = Set(everyday.map(\.date))
        let families = Set(everyday.map { Categories.family($0.category) })
        u.firstEveryday = days.min()
        u.chart = days.count >= 3
        u.range = days.count >= 14
        u.whereItGoes = families.count >= 3
        u.projection = u.chart && pace.perDay != nil && pace.days >= 7

        let legacy = trip.createdAt.flatMap(Self.parseTimestamp).map { $0 < round2Shipped } ?? false
        u.beyond = legacy || settled.contains { !isEverydayRow($0) && (tripStart == nil || $0.date >= tripStart!) }
        if legacy {
            u.chart = true; u.range = true; u.whereItGoes = true; u.projection = true
        }
        // Once shown, a card stays (state.moneyUnlocked, written by the web).
        if case .object(let kept)? = trip.rawState["moneyUnlocked"] {
            if kept["chart"] != nil { u.chart = true }
            if kept["range"] != nil { u.range = true }
            if kept["where"] != nil { u.whereItGoes = true }
            if kept["projection"] != nil { u.projection = true }
        }
        return u
    }

    private static func parseTimestamp(_ s: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        if let d = f.date(from: s) { return d }
        // Postgres writes "2026-09-01 10:00:00.123+00"
        let g = DateFormatter()
        g.locale = Locale(identifier: "en_US_POSIX")
        for fmt in ["yyyy-MM-dd HH:mm:ss.SSSSSSXXXXX", "yyyy-MM-dd HH:mm:ssXXXXX", "yyyy-MM-dd'T'HH:mm:ss.SSSSSSXXXXX"] {
            g.dateFormat = fmt
            if let d = g.date(from: s) { return d }
        }
        return nil
    }

    // MARK: chart and where it goes

    /// Every day in [from, to], everyday spending stacked by family (spending.ts dailySpend).
    func daily(from: String, to: String) -> [Day] {
        var days: [String: Day] = [:]
        var d = from
        var order: [String] = []
        while d <= to, order.count < 400 {
            days[d] = Day(date: d)
            order.append(d)
            d = Days.add(d, 1)
        }
        for e in ledger where e.isExpense && isEverydayRow(e) && days[e.date] != nil {
            days[e.date]!.byFamily[Categories.family(e.category), default: 0] += Journey.toBase(e.amount, e.currency, rates)
        }
        return order.compactMap { days[$0] }
    }

    /// Every expense on one day, largest first (the chart's tap callout).
    func entries(on date: String) -> [LedgerEntry] {
        ledger.filter { $0.isExpense && $0.date == date }
            .sorted { Journey.toBase($0.amount, $0.currency, rates) > Journey.toBase($1.amount, $1.currency, rates) }
    }

    /// Everyday spending by category over [from, to], largest first.
    func byCategory(from: String, to: String) -> [CategoryTotal] {
        var totals: [String: (Double, Int)] = [:]
        for e in ledger where e.isExpense && isEverydayRow(e) && e.date >= from && e.date <= to {
            let v = totals[e.category] ?? (0, 0)
            totals[e.category] = (v.0 + Journey.toBase(e.amount, e.currency, rates), v.1 + 1)
        }
        return totals.map { CategoryTotal(category: $0.key, total: $0.value.0, count: $0.value.1) }
            .sorted { $0.total > $1.total }
    }

    /// The window the chart and Where it goes share (MoneyPage.tsx): 14 days
    /// back from today, or from the first everyday entry while it's locked.
    func window(range: Int, end: String?) -> (from: String, to: String) {
        if !unlocks.range {
            let back = Days.add(today, -13)
            let from = (unlocks.firstEveryday ?? back) > back ? unlocks.firstEveryday! : back
            return (from, today)
        }
        let to = end ?? today
        return (Days.add(to, -(range - 1)), to)
    }

    var earliestDate: String { min(ledger.map(\.date).filter { !$0.isEmpty }.min() ?? today, today) }

    // MARK: today and here

    /// Everyday spending dated today.
    var todaySpent: Double {
        ledger.filter { $0.isExpense && $0.date == today && isEverydayRow($0) }
            .reduce(0) { $0 + Journey.toBase($1.amount, $1.currency, rates) }
    }

    /// Everything else dated today (a ticket, a bus between cities).
    var todayOther: Double {
        ledger.filter { $0.isExpense && $0.date == today && !isEverydayRow($0) }
            .reduce(0) { $0 + Journey.toBase($1.amount, $1.currency, rates) }
    }

    var currentPlan: PlanRow? { current.flatMap { cur in plan.first { $0.seg.id == cur.id } } }

    /// Hand-typed entries up to today, newest first (LatestStrip.tsx).
    var latest: [LedgerEntry] {
        ledger.enumerated()
            .filter { $0.element.source == nil && !$0.element.date.isEmpty && $0.element.date <= today }
            .sorted { $0.element.date != $1.element.date ? $0.element.date > $1.element.date : $0.offset > $1.offset }
            .map(\.element)
    }
}

// MARK: - formatting

enum MoneyText {
    /// "1 327 825 Ft" (format.ts fmtMoney).
    static func full(_ n: Double, _ cur: String) -> String { Journey.money(n, cur) }

    /// The currency's narrow symbol: "Ft", "$", "฿".
    static func symbol(_ cur: String) -> String {
        let s = Journey.money(0, cur)
        return s.filter { !$0.isNumber && !$0.isWhitespace && $0 != "\u{202F}" && $0 != "\u{00A0}" }
    }

    /// Big amounts rounded to read at a glance (Patrik, 27 Sep): "1.33 M Ft".
    /// Under a million the whole amount, as on the web.
    static func short(_ n: Double, _ cur: String) -> String {
        guard abs(n) >= 1_000_000 else { return full(n, cur) }
        let m = n / 1_000_000
        let digits = abs(m) >= 100 ? 0 : (abs(m) >= 10 ? 1 : 2)
        // "1.33" in English, "1,33" in Hungarian; groups with a space in both.
        var num = m.formatted(.number.precision(.fractionLength(min(1, digits)...digits)).locale(L10n.isEnglish ? Locale(identifier: "en_US") : L10n.locale))
        if L10n.isEnglish { num = num.replacingOccurrences(of: ",", with: " ") }
        let sym = symbol(cur)
        return cur == "HUF" || sym.count > 1 ? "\(num) M \(sym)" : "\(sym)\(num) M"
    }

    /// A projection: rounded, "≈ 465 800 Ft", "≈ 2.64 M Ft".
    static func approx(_ n: Double, _ cur: String) -> String {
        let step: Double = abs(n) >= 100_000 ? 100 : (abs(n) >= 10_000 ? 10 : 1)
        return "≈ " + short((n / step).rounded() * step, cur)
    }

    /// The plain number without currency ("465 800"), for tight rows.
    static func number(_ n: Double, _ cur: String) -> String {
        let s = full(n, cur)
        let sym = symbol(cur)
        return s.replacingOccurrences(of: sym, with: "").trimmingCharacters(in: .whitespaces.union(CharacterSet(charactersIn: "\u{202F}\u{00A0}")))
    }

    /// "12 000 THB" — an entry's own amount, when it isn't in the base currency.
    static func original(_ e: LedgerEntry) -> String {
        let n = e.amount.formatted(.number.precision(.fractionLength(0...2)).locale(L10n.isEnglish ? Locale(identifier: "en_US") : L10n.locale))
        return "\(n) \(e.currency)"
    }

    /// "today", "yesterday", "12 Sep" (LatestStrip.tsx).
    static func day(_ iso: String, today: String) -> String {
        if iso == today { return String(localized: "today") }
        if iso == Days.add(today, -1) { return String(localized: "yesterday") }
        return Days.short(iso)
    }

    /// "Sun 20 Sep".
    static func weekday(_ iso: String) -> String { Days.weekday(iso) }
}
