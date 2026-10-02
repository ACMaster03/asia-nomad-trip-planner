import Foundation

// What Money reads besides the trip document: the ledger (`trips.ledger`, one
// jsonb array next to `state`) and the subscriptions kept in `state`.
// Types from product/src/lib/trips/types.ts.

/// One row of the ledger. Decoding is forgiving like the trip's; the entry as
/// stored is kept in `raw`, so an edit from the phone sends back every field it
/// doesn't know (the web replaces the whole entry by id).
struct LedgerEntry: Identifiable, Sendable, Hashable {
    struct Source: Sendable, Hashable {
        /// "stay", "transport", "extra" (legacy) or "sub"
        let kind: String
        /// For "sub": "<subId>@<date>"
        let id: String
        var key: String { "\(kind):\(id)" }
    }

    var id: String
    /// YYYY-MM-DD
    var date: String
    var type: CategoryKind
    var category: String
    var amount: Double
    var currency: String
    var note: String
    var source: Source?
    var orphaned: Bool
    /// Only when it differs from the category's own rule.
    var everyday: Bool?
    /// The subscription it belongs to; read-only on the phone (kept in `raw`).
    let subId: String?
    let raw: JSONValue

    init(raw: JSONValue) {
        self.raw = raw
        id = raw["id"]?.text ?? ""
        date = String((raw["date"]?.text ?? "").prefix(10))
        type = raw["type"]?.stringValue == "income" ? .income : .expense
        category = raw["category"]?.text ?? ""
        amount = raw["amount"]?.numberValue ?? Double(raw["amount"]?.stringValue ?? "") ?? 0
        currency = raw["currency"]?.text ?? ""
        note = raw["note"]?.text ?? ""
        if let s = raw["source"], let kind = s["kind"]?.stringValue, let sid = s["id"]?.text {
            source = Source(kind: kind, id: sid)
        } else {
            source = nil
        }
        orphaned = raw["orphaned"]?.boolValue ?? false
        everyday = raw["everyday"]?.boolValue
        subId = raw["subId"]?.stringValue
    }

    /// A new entry typed on the phone.
    init(id: String, date: String, type: CategoryKind, category: String, amount: Double, currency: String, note: String, everyday: Bool?) {
        self.init(raw: .object([:]))
        self.id = id
        self.date = date
        self.type = type
        self.category = category
        self.amount = amount
        self.currency = currency
        self.note = note
        self.everyday = everyday
    }

    /// The stored shape with the phone's changes on top.
    var json: JSONValue {
        var o: [String: JSONValue] = {
            if case .object(let o) = raw { return o }
            return [:]
        }()
        o["id"] = .string(id)
        o["date"] = .string(date)
        o["type"] = .string(type.rawValue)
        o["category"] = .string(category)
        o["amount"] = .number(amount)
        o["currency"] = .string(currency)
        o["note"] = .string(note)
        if let everyday { o["everyday"] = .bool(everyday) } else { o.removeValue(forKey: "everyday") }
        return .object(o)
    }

    var isExpense: Bool { type == .expense }
    var isImported: Bool { source?.kind == "stay" || source?.kind == "transport" }
}

/// A recurring cost from home (types.ts Subscription).
struct Subscription: Identifiable, Sendable {
    let id: String
    let label: String
    let cur: String
    let amount: Double
    let everyMonths: Int
    let anchor: String
    let cancelledOn: String?
    /// A heads-up before it charges, `leadDays` ahead (by email for now).
    let remind: Bool
    let leadDays: Int
    /// The first day the app writes its charges by itself (types.ts autoFrom).
    let autoFrom: String?

    init?(raw: JSONValue) {
        guard let id = raw["id"]?.text else { return nil }
        self.id = id
        label = raw["label"]?.text ?? ""
        cur = raw["cur"]?.text ?? "HUF"
        amount = raw["amount"]?.numberValue ?? Double(raw["amount"]?.stringValue ?? "") ?? 0
        everyMonths = max(1, Int((raw["everyMonths"]?.numberValue ?? 1).rounded()))
        anchor = String((raw["anchor"]?.text ?? "").prefix(10))
        let c = raw["cancelledOn"]?.text ?? ""
        cancelledOn = Subscriptions.valid(c) ? c : nil
        remind = raw["remind"]?.boolValue ?? false
        leadDays = Int((raw["leadDays"]?.numberValue ?? 3).rounded())
        let from = raw["autoFrom"]?.text ?? ""
        autoFrom = from.isEmpty ? nil : String(from.prefix(10))
    }

    var isCancelled: Bool { cancelledOn != nil }
}

/// The schedule maths of product/src/lib/trips/subscriptions.ts: declared, never
/// inferred; plain ISO arithmetic so no timezone moves a charge.
enum Subscriptions {
    static func valid(_ iso: String?) -> Bool {
        guard let iso, iso.count == 10 else { return false }
        return iso.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil
    }

    private static func parts(_ iso: String) -> (y: Int, m: Int, d: Int) {
        let p = iso.split(separator: "-").map { Int($0) ?? 0 }
        return (p[0], p[1], p[2])
    }

    private static func daysIn(_ y: Int, _ m: Int) -> Int {
        var c = DateComponents(); c.year = y; c.month = m
        let cal = Calendar(identifier: .gregorian)
        return cal.range(of: .day, in: .month, for: cal.date(from: c) ?? .now)?.count ?? 30
    }

    /// The anchor moved by k months, the day clamped to the month.
    static func shiftMonths(_ anchor: String, _ k: Int) -> String {
        let a = parts(anchor)
        let total = a.y * 12 + (a.m - 1) + k
        let y = Int((Double(total) / 12).rounded(.down)), m = total - y * 12 + 1
        return String(format: "%04d-%02d-%02d", y, m, min(a.d, daysIn(y, m)))
    }

    /// The first charge on or after `from`; nil once cancelled.
    static func nextCharge(_ sub: Subscription, from: String) -> String? {
        guard valid(sub.anchor), valid(from) else { return nil }
        let a = parts(sub.anchor), f = parts(from)
        let months = (f.y - a.y) * 12 + (f.m - a.m)
        var k = max(0, Int((Double(months) / Double(sub.everyMonths)).rounded(.down)))
        for _ in 0..<4 {
            let at = shiftMonths(sub.anchor, k * sub.everyMonths)
            k += 1
            if at < from { continue }
            if let c = sub.cancelledOn, at >= c { return nil }
            return at
        }
        return nil
    }

    /// Every charge in [from, to], inclusive.
    static func charges(_ sub: Subscription, from: String, to: String) -> [String] {
        var out: [String] = []
        var cursor = from
        while let at = nextCharge(sub, from: cursor), at <= to, out.count < 400 {
            out.append(at)
            cursor = Days.add(at, 1)
        }
        return out
    }
}

/// A city's catalogue costs in USD, [budget, mid, nice] and [low, mid, high]
/// (budget.ts buildCityIndex). Used for a stop without a stay or a pace yet.
struct CityCost: Codable, Sendable {
    let accom: [Double]
    let live: [Double]

    init(accom: [Double], live: [Double]) {
        self.accom = accom
        self.live = live
    }

    /// From a `cities.attributes` document; nil when it isn't fully catalogued.
    init?(attributes: JSONValue) {
        let a = attributes["costs"]?["accomPerNight"], l = attributes["costs"]?["dailyLiving"]
        guard let b = a?["budget"]?.numberValue, let m = a?["mid"]?.numberValue, let n = a?["nice"]?.numberValue,
              let lo = l?["low"]?.numberValue, let lm = l?["mid"]?.numberValue, let hi = l?["high"]?.numberValue
        else { return nil }
        accom = [b, m, n]
        live = [lo, lm, hi]
    }
}
