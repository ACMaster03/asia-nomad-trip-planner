import Foundation

// Plan → ledger, one way: booked stays and legs land in All entries on their
// charge date (product/src/lib/trips/importCosts.ts planImports, run by the
// web's usePlanSync). Ported so a booking made on the phone counts as
// scheduled without anyone opening the web (Patrik, 29 Sep). Change a rule
// there, change it here: both apps write the same rows, so any difference in
// amount, date or note would have them rewrite each other's rows forever.
//
// And the subscription charges whose date has come (subChargesDue), each
// announced once on the phone (ChargeNotice.swift), as on the web.

enum PlanSync {
    struct Plan {
        /// Bookings not in the ledger yet (and not deleted from it by hand).
        var candidates: [LedgerEntry] = []
        /// Rows whose booking changed, brought in line.
        var updates: [LedgerEntry] = []
        /// Rows whose booking is gone: flagged, never deleted.
        var orphans: [LedgerEntry] = []
        /// Subscription charges whose day has come and that nothing covers yet.
        var subCharges: [LedgerEntry] = []

        /// What to write now; new booking rows only while `autoImport` isn't
        /// switched off (that switch is about bookings, not subscriptions).
        func writes(autoImport: Bool) -> [LedgerEntry] { updates + orphans + (autoImport ? candidates : []) + subCharges }
    }

    private struct Candidate {
        let kind: String
        let id: String
        let date: String
        let category: String
        let amount: Double
        let currency: String
        let note: String
        var key: String { "\(kind):\(id)" }
    }

    /// Rounded to cents, as the web does, so both compare equal (importCosts.ts cents).
    private static func cents(_ n: Double) -> Double { (n * 100).rounded() / 100 }

    private static func stay(_ st: Stay, _ state: TripState) -> Candidate? {
        guard Journey.isBooked(st.status), st.include != false,
              let date = st.chargeDate, !date.isEmpty else { return nil }
        let seg = state.segments.first { $0.id == st.segId }
        let amount = cents(Journey.stayTotal(st, seg))
        guard amount > 0 else { return nil }
        return Candidate(kind: "stay", id: st.id, date: date, category: "stays", amount: amount, currency: st.cur, note: st.name)
    }

    private static func leg(_ t: TransportLeg) -> Candidate? {
        guard Journey.isBooked(t.status), t.include != false else { return nil }
        // When the card was charged, if filled in; the travel date otherwise.
        let date = [t.chargeDate, t.date].compactMap { $0 }.first { !$0.isEmpty }
        guard let date, t.price > 0 else { return nil }
        return Candidate(kind: "transport", id: t.id, date: date, category: "transport", amount: cents(t.price),
                         currency: t.cur, note: "\(t.type) \(t.from) → \(t.to)")
    }

    /// The row as the web writes it, over what the stored row already carries.
    private static func entry(_ c: Candidate, id: String, over raw: JSONValue = .object([:])) -> LedgerEntry {
        var o: [String: JSONValue] = {
            if case .object(let o) = raw { return o }
            return [:]
        }()
        o["id"] = .string(id)
        o["date"] = .string(c.date)
        o["type"] = .string("expense")
        o["category"] = .string(c.category)
        o["amount"] = .number(c.amount)
        o["currency"] = .string(c.currency)
        o["note"] = .string(c.note)
        o["source"] = .object(["kind": .string(c.kind), "id": .string(c.id)])
        o.removeValue(forKey: "orphaned")
        return LedgerEntry(raw: .object(o))
    }

    /// Subscriptions declared before automatic charges shipped start here (importCosts.ts).
    static let subChargesFrom = "2026-09-25"
    /// A charge typed by hand this close to the date covers it.
    private static let coverDays = 15

    private static func nameKey(_ s: String) -> String {
        s.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
    }

    /// The subscription charges to write now (importCosts.ts subChargesDue): from
    /// the day it was added (or the start of automatic charges) and the journey's
    /// start, up to today or the journey's end, each once.
    static func subCharges(_ trip: TripRow, today: String) -> [LedgerEntry] {
        guard Subscriptions.valid(today), case .array(let items)? = trip.rawState["subscriptions"] else { return [] }
        let subs = items.compactMap(Subscription.init(raw:))
        let skip = skipped(trip)
        let written = Set(trip.ledger.compactMap { $0.source?.kind == "sub" ? $0.source?.key : nil })
        let start = trip.state.meta.startDate ?? ""
        let end = trip.state.meta.endDate ?? ""
        var out: [LedgerEntry] = []
        for sub in subs {
            let from = max(sub.autoFrom ?? subChargesFrom, start)
            let to = !end.isEmpty && end < today ? end : today
            for at in Subscriptions.charges(sub, from: from, to: to) {
                let key = "sub:\(sub.id)@\(at)"
                if written.contains(key) || skip.contains(key) { continue }
                let covered = trip.ledger.contains { e in
                    // Days apart either way (Days.between stops at 0 going backwards).
                    e.isExpense && e.source?.kind != "sub" && Subscriptions.valid(e.date)
                        && max(Days.between(e.date, at), Days.between(at, e.date)) <= coverDays
                        && (e.subId == sub.id
                            || (e.subId == nil && e.category == "subscriptions" && !nameKey(e.note).isEmpty && nameKey(e.note) == nameKey(sub.label)))
                }
                if covered { continue }
                out.append(LedgerEntry(raw: .object([
                    "id": .string("le-sub-\(sub.id)-\(at)"),
                    "date": .string(at),
                    "type": .string("expense"),
                    "category": .string("subscriptions"),
                    "amount": .number(cents(sub.amount)),
                    "currency": .string(sub.cur),
                    "note": .string(sub.label),
                    "source": .object(["kind": .string("sub"), "id": .string("\(sub.id)@\(at)")]),
                    "subId": .string(sub.id),
                ])))
            }
        }
        return out
    }

    private static func skipped(_ trip: TripRow) -> Set<String> {
        guard case .array(let a)? = trip.rawState["importSkip"] else { return [] }
        return Set(a.compactMap(\.stringValue))
    }

    static func plan(_ trip: TripRow, today: String) -> Plan {
        let state = trip.state
        var wanted: [String: Candidate] = [:]
        for st in state.stays { if let c = stay(st, state) { wanted[c.key] = c } }
        for t in state.transport { if let c = leg(t) { wanted[c.key] = c } }

        let skip = skipped(trip)
        // Subscription charges and the old one-offs are left alone here.
        var imported: [String: LedgerEntry] = [:]
        for e in trip.ledger {
            if let s = e.source, s.kind == "stay" || s.kind == "transport" { imported[s.key] = e }
        }

        var plan = Plan()
        for (key, c) in wanted.sorted(by: { $0.key < $1.key }) {
            guard let existing = imported[key] else {
                // The web's id, so both apps write the same row, never two.
                if !skip.contains(key) { plan.candidates.append(entry(c, id: "le-plan-\(c.kind)-\(c.id)")) }
                continue
            }
            // The stored date in full, as the web compares it (the entry's own is cut to the day).
            if existing.amount != c.amount || (existing.raw["date"]?.text ?? "") != c.date || existing.currency != c.currency
                || existing.note != c.note || existing.category != c.category || existing.orphaned {
                plan.updates.append(entry(c, id: existing.id, over: existing.raw))
            }
        }
        for (key, e) in imported.sorted(by: { $0.key < $1.key }) where wanted[key] == nil && !e.orphaned {
            var o: [String: JSONValue] = {
                if case .object(let o) = e.json { return o }
                return [:]
            }()
            o["orphaned"] = .bool(true)
            plan.orphans.append(LedgerEntry(raw: .object(o)))
        }
        plan.subCharges = subCharges(trip, today: today)
        return plan
    }
}
