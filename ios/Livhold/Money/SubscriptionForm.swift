import SwiftUI

// Add / edit a subscription, the web's SubscriptionSheet.tsx (#37) in the
// Trip forms' shape (EditForm): you declare the amount, how often and the day
// it hangs off, and every date follows from that. "Mark cancelled" is a state,
// not a delete: predictions and reminders stop, past charges stay. Delete is
// for the one typed by mistake.
//
// It writes `state.subscriptions` through write_state (store.save), changing
// only the fields it owns, so anything the web adds to a subscription stays.
// The charges themselves are still written by the web (importCosts.ts), from
// `autoFrom` on.

/// Which subscription the form edits; nil adds one.
struct SubTarget: Identifiable {
    let sub: Subscription?
    var id: String { sub?.id ?? "new" }
}

struct SubscriptionForm: View {
    let sub: Subscription?
    @Environment(TripStore.self) private var store

    private static let cadences = [(1, "Monthly"), (3, "Every 3 months"), (6, "Every 6 months"), (12, "Yearly")]
    private static let leads = [1, 3, 7]

    @State private var name: String
    @State private var amount: String
    @State private var cur: String
    @State private var everyMonths: Int
    @State private var anchor: String
    @State private var remind: Bool
    @State private var leadDays: Int
    @State private var cancelledOn: String?
    private let initial: [String]

    init(sub: Subscription?) {
        self.sub = sub
        let today = Days.today()
        _name = State(initialValue: sub?.label ?? "")
        _amount = State(initialValue: sub.map { Price.text($0.amount) } ?? "")
        _cur = State(initialValue: sub?.cur ?? "")
        _everyMonths = State(initialValue: sub?.everyMonths ?? 1)
        _anchor = State(initialValue: sub.flatMap { Subscriptions.valid($0.anchor) ? $0.anchor : nil } ?? today)
        _remind = State(initialValue: sub?.remind ?? false)
        _leadDays = State(initialValue: sub?.leadDays ?? 3)
        _cancelledOn = State(initialValue: sub?.cancelledOn)
        initial = Self.snapshot(sub?.label ?? "", sub.map { Price.text($0.amount) } ?? "", sub?.cur ?? "",
                                sub?.everyMonths ?? 1, sub?.anchor ?? today, sub?.remind ?? false,
                                sub?.leadDays ?? 3, sub?.cancelledOn)
    }

    private static func snapshot(_ n: String, _ a: String, _ c: String, _ e: Int, _ an: String, _ r: Bool, _ l: Int, _ x: String?) -> [String] {
        [n, a, c, "\(e)", an, "\(r)", "\(l)", x ?? ""]
    }

    var body: some View {
        if let state = store.trip?.state {
            let currency = cur.isEmpty ? state.meta.baseCurrency : cur
            EditForm(
                title: sub == nil ? "Add subscription" : "Edit subscription",
                canSave: valid,
                dirty: Self.snapshot(name, amount, cur, everyMonths, anchor, remind, leadDays, cancelledOn) != initial,
                saveLabel: sub == nil ? "Add" : "Save",
                save: { try await save(currency) },
                delete: sub.map { sub in
                    EditDelete(label: "Delete subscription", question: "Delete this subscription?",
                               message: "“Mark cancelled” keeps what it already charged; deleting forgets it.",
                               action: { try await store.save { $0.remove("subscriptions", id: sub.id) } })
                }
            ) {
                Section {
                    TextField("What is it? e.g. iCloud 2 TB", text: $name)
                    PriceRow(label: "Amount", amount: $amount,
                             cur: Binding(get: { currency }, set: { cur = $0 }),
                             currencies: Price.currencies(state, currency))
                }
                .listRowBackground(Palette.sf)

                Section {
                    Picker("Repeats", selection: $everyMonths) {
                        ForEach(Self.cadences, id: \.0) { Text($0.1).tag($0.0) }
                    }
                    .pickerStyle(.menu)
                    .menuSettles(on: everyMonths)
                    DatePicker(everyMonths == 1 ? "Charged on" : "Last (or next) charge", selection: anchorDate, displayedComponents: .date)
                        .environment(\.timeZone, Days.utc)
                } footer: {
                    Text("The app works out every charge from this date.")
                }
                .listRowBackground(Palette.sf)

                Section(cancelledOn == nil ? "Next charge" : "Cancelled") { schedule }
                    .listRowBackground(Palette.sf)

                if cancelledOn == nil {
                    Section {
                        Toggle("Remind me before it charges", isOn: $remind.animation(Motion.quick))
                        if remind {
                            Picker("When", selection: $leadDays) {
                                ForEach(Self.leads, id: \.self) { Text(Self.leadLabel($0)).tag($0) }
                            }
                            .pickerStyle(.menu)
                            .menuSettles(on: leadDays)
                        }
                    } footer: {
                        if remind { Text("By email for now; the app’s own notifications come later.") }
                    }
                    .listRowBackground(Palette.sf)
                }

                if sub != nil {
                    Section {
                        if cancelledOn != nil {
                            Button("Resume this subscription") { withAnimation(Motion.quick) { cancelledOn = nil } }
                                .foregroundStyle(Palette.ac)
                        } else {
                            Button("Mark cancelled") { withAnimation(Motion.quick) { cancelledOn = Days.today() } }
                                .foregroundStyle(Palette.warn)
                        }
                    } footer: {
                        Text("Cancelling stops the prediction and keeps every charge it already made. Save to confirm.")
                    }
                    .listRowBackground(Palette.sf)
                }
            }
        }
    }

    // MARK: parts

    /// The real schedule maths, the same the card and the projection use.
    @ViewBuilder private var schedule: some View {
        if let off = cancelledOn {
            Text("Stopped \(Days.short(off)) · nothing further predicted").foregroundStyle(Palette.tx2)
        } else if let next = Subscriptions.nextCharge(draft, from: Days.today()) {
            let days = Days.between(Days.today(), next)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(MoneyText.weekday(next) + (next.prefix(4) == Days.today().prefix(4) ? "" : " \(next.prefix(4))"))
                        .font(.sans(16, weight: .semibold))
                    Text(days == 0 ? "today" : days == 1 ? "tomorrow" : "in \(days) days")
                        .font(.sans(12, weight: .bold)).foregroundStyle(Palette.warn)
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .background(Palette.warnSoft, in: .capsule)
                }
                Text(rhythm(after: next)).font(.sans(13)).foregroundStyle(Palette.tx2)
            }
            .padding(.vertical, 2)
        } else {
            Text("Set a date above and the schedule follows from it.").foregroundStyle(Palette.tx2)
        }
    }

    /// "every month on the 12th, then 12 Nov · 12 Dec · 12 Jan"
    private func rhythm(after next: String) -> String {
        let ahead = everyMonths >= 12 ? 1 : 3
        let then = (1...ahead).map { Subscriptions.shiftMonths(next, $0 * everyMonths) }
            .map { $0.prefix(4) == next.prefix(4) ? Days.short($0) : "\(Days.short($0)) \($0.prefix(4))" }
        let every = everyMonths == 1 ? "every month on the \(Self.ordinal(Int(anchor.suffix(2)) ?? 1))"
            : everyMonths == 12 ? "yearly" : "every \(everyMonths) months"
        return "\(every), then \(then.joined(separator: " · "))"
    }

    static func ordinal(_ d: Int) -> String {
        let suffix = (11...13).contains(d % 100) ? "th" : (d % 10 == 1 ? "st" : d % 10 == 2 ? "nd" : d % 10 == 3 ? "rd" : "th")
        return "\(d)\(suffix)"
    }

    static func leadLabel(_ days: Int) -> String { "\(days) day\(days == 1 ? "" : "s") before" }

    private var anchorDate: Binding<Date> {
        Binding(get: { Days.date(anchor) ?? .now }, set: { anchor = Days.iso($0) })
    }

    private var valid: Bool { Price.value(amount) > 0 && !name.trimmed.isEmpty && Subscriptions.valid(anchor) }

    private var draft: Subscription {
        Subscription(raw: .object([
            "id": .string("preview"), "label": .string(name), "cur": .string(cur),
            "amount": .number(Price.value(amount)), "everyMonths": .number(Double(everyMonths)),
            "anchor": .string(anchor),
        ]))!
    }

    private func save(_ currency: String) async throws {
        var fields: [String: JSONValue?] = [
            "label": .string(name.trimmed),
            "cur": .string(currency),
            "amount": .number(Price.value(amount)),
            "everyMonths": .number(Double(everyMonths)),
            "anchor": .string(anchor),
            "remind": .bool(remind && cancelledOn == nil),
            "leadDays": remind && cancelledOn == nil ? .number(Double(leadDays)) : nil,
            "cancelledOn": cancelledOn.map { .string($0) },
        ]
        // The web writes its charges from the day it was added: a past anchor
        // is a known charge, not one to log again (importCosts.ts).
        if sub == nil { fields["autoFrom"] = .string(Days.today()) }
        let id = sub?.id ?? newId("sub")
        try await store.save { $0.upsert("subscriptions", id: id, fields) }
    }
}
