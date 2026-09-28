import SwiftUI

// Subscriptions, Latest's pattern (Patrik, 29 Sep): Money's card shows the three
// that charge next and opens this page, which holds them all, what they add up
// to, the cancelled ones and the way to add one. No card on Money folds any more.

/// The subscriptions as the card and the page list them.
enum SubscriptionList {
    /// Active ones, the next charge first.
    static func active(_ model: MoneyModel) -> [Subscription] {
        model.subscriptions.filter { !$0.isCancelled }
            .sorted { (Subscriptions.nextCharge($0, from: model.today) ?? "9999") < (Subscriptions.nextCharge($1, from: model.today) ?? "9999") }
    }

    /// Cancelled ones, the latest first.
    static func cancelled(_ model: MoneyModel) -> [Subscription] {
        model.subscriptions.filter(\.isCancelled).sorted { ($0.cancelledOn ?? "") > ($1.cancelledOn ?? "") }
    }

    /// What the active ones cost a month, a yearly one as a twelfth.
    static func monthly(_ active: [Subscription], _ model: MoneyModel) -> Double {
        active.reduce(0) { $0 + Journey.toBase($1.amount, $1.cur, model.rates) / Double($1.everyMonths) }
    }

    /// What the active ones take from tomorrow to the journey's end.
    static func ahead(_ active: [Subscription], _ model: MoneyModel) -> (days: Int, total: Double)? {
        guard let end = model.tripEnd, end > model.today else { return nil }
        let from = Days.add(model.today, 1)
        let total = active.reduce(0.0) { sum, s in
            sum + Double(Subscriptions.charges(s, from: from, to: end).count) * Journey.toBase(s.amount, s.cur, model.rates)
        }
        return (Days.between(model.today, end), total)
    }
}

/// One subscription: the bell, the name, when it charges next, the amount. A
/// tap opens its form.
struct SubscriptionRow: View {
    let sub: Subscription
    let model: MoneyModel
    @Environment(TripStore.self) private var store
    @Environment(MoneyEditor.self) private var editor
    /// The bell's new state from the tap until the save lands, so it turns at once.
    @State private var reminding: Bool?

    var body: some View {
        let off = sub.isCancelled
        let next = off ? nil : Subscriptions.nextCharge(sub, from: model.today)
        HStack(alignment: .top, spacing: 12) {
            bell
            Button { editor.sub = SubTarget(sub: sub) } label: {
                HStack(alignment: .top, spacing: 8) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(sub.label).font(.sans(15, weight: .medium))
                            .foregroundStyle(off ? Palette.tx3 : Palette.tx)
                            .strikethrough(off).lineLimit(1)
                        detail(next: next)
                    }
                    Spacer(minLength: 6)
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(MoneyText.full(Journey.toBase(sub.amount, sub.cur, model.rates), model.base))
                            .font(.sans(15, weight: .semibold)).foregroundStyle(off ? Palette.tx3 : Palette.tx)
                        Text(cadence).font(.sans(12.5)).foregroundStyle(Palette.tx2)
                    }
                    if store.canEdit {
                        Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Palette.tx3).padding(.top, 4)
                    }
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .disabled(!store.canEdit)
        }
        .padding(.vertical, 9)
    }

    /// On: a reminder before it charges. One tap turns it on or off, as on the web.
    @ViewBuilder private var bell: some View {
        let on = (reminding ?? sub.remind) && !sub.isCancelled
        let icon = Image(systemName: sub.isCancelled ? "minus" : (on ? "bell.fill" : "bell.slash"))
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(on ? Palette.ac2Deep : Palette.tx3)
            .frame(width: 34, height: 34)
            .background(on ? Palette.ac2Soft : Palette.fill, in: .circle)
        if store.canEdit && !sub.isCancelled {
            Button { toggleRemind() } label: { icon }
                .buttonStyle(.plain)
                .accessibilityLabel(on ? String(localized: "Reminder on, \(SubscriptionForm.leadLabel(sub.leadDays)). Turn off") : String(localized: "Reminder off. Turn on"))
                .sensoryFeedback(.selection, trigger: on)
        } else {
            icon
        }
    }

    private func detail(next: String?) -> some View {
        var line: Text
        if let off = sub.cancelledOn {
            line = Text("cancelled \(Days.short(off))")
        } else {
            line = sub.everyMonths == 1 ? Text("on the \(SubscriptionForm.ordinal(Int(sub.anchor.suffix(2)) ?? 1))")
                : Text(next.map { String(localized: "next \(Days.short($0))") } ?? "")
            // Within a week, how soon says it better than the date (Patrik, 29 Sep).
            if let next, case let soon = Days.between(model.today, next), soon <= 7 {
                line = Text(Self.when(soon)).foregroundColor(Palette.warn).bold()
            }
        }
        return line.font(.sans(12.5)).foregroundStyle(Palette.tx2)
    }

    static func when(_ days: Int) -> String {
        days == 0 ? String(localized: "today") : days == 1 ? String(localized: "tomorrow") : String(localized: "in \(days) days")
    }

    private var cadence: String {
        sub.everyMonths == 1 ? String(localized: "monthly")
            : (sub.everyMonths == 12 ? String(localized: "yearly") : String(localized: "every \(sub.everyMonths) months"))
    }

    private func toggleRemind() {
        let to = !(reminding ?? sub.remind)
        reminding = to
        Task {
            // Saved or not, the journey's own value shows again: the new one, or the old.
            defer { reminding = nil }
            try? await store.save { state in
                state.upsert("subscriptions", id: sub.id, [
                    "remind": .bool(to),
                    "leadDays": .number(Double(sub.leadDays)),
                ])
            }
        }
    }
}

/// Nothing yet: what a subscription is here, and the way to add one.
struct SubscriptionsEmpty: View {
    @Environment(TripStore.self) private var store
    @Environment(MoneyEditor.self) private var editor

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            (store.canEdit
                ? Text("No subscriptions yet. Add the ones that keep charging from home, like Netflix or iCloud, and each charge adds itself on its day.")
                : Text("No subscriptions recorded yet."))
                .font(.sans(14)).foregroundStyle(Palette.tx2)
                .fixedSize(horizontal: false, vertical: true)
            if store.canEdit {
                Button { editor.sub = SubTarget(sub: nil) } label: {
                    Label("Subscription", systemImage: "plus")
                        .font(.sans(15, weight: .semibold))
                        .foregroundStyle(Palette.ac2Deep)
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .background(Palette.ac2Soft, in: .rect(cornerRadius: Radius.rCtl))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 6)
    }
}

/// Every subscription: the active ones and what they add up to, then the
/// cancelled ones. Opens from Money's card.
struct SubscriptionsScreen: View {
    @Environment(TripStore.self) private var store
    @Environment(MoneyEditor.self) private var editor

    var body: some View {
        Group {
            if let trip = store.trip {
                content(MoneyModel(trip: trip, ledger: trip.ledger, cities: store.cityCosts, today: Days.today()))
            } else {
                Color.clear
            }
        }
        .background(Palette.canvas.ignoresSafeArea())
        .navigationTitle("Subscriptions")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if store.canEdit {
                ToolbarItem(placement: .primaryAction) {
                    Button { editor.sub = SubTarget(sub: nil) } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Add subscription")
                }
            }
        }
    }

    private func content(_ model: MoneyModel) -> some View {
        let active = SubscriptionList.active(model)
        let cancelled = SubscriptionList.cancelled(model)
        return ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if model.subscriptions.isEmpty {
                    card { SubscriptionsEmpty() }
                } else {
                    card {
                        if active.isEmpty {
                            Text("None active.").font(.sans(14)).foregroundStyle(Palette.tx2).padding(.vertical, 10)
                        }
                        ForEach(Array(active.enumerated()), id: \.element.id) { i, s in
                            if i > 0 { Divider().overlay(Palette.ln) }
                            SubscriptionRow(sub: s, model: model)
                        }
                        if !active.isEmpty { totals(active, model) }
                    }
                    if !cancelled.isEmpty {
                        card {
                            CardLabel("Cancelled").padding(.bottom, 4)
                            ForEach(cancelled) { s in
                                Divider().overlay(Palette.ln)
                                SubscriptionRow(sub: s, model: model)
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
    }

    private func totals(_ active: [Subscription], _ model: MoneyModel) -> some View {
        VStack(spacing: 4) {
            Divider().overlay(Palette.ln).padding(.bottom, 6)
            HStack {
                Text("\(active.count) active").foregroundStyle(Palette.tx2)
                Spacer()
                Text("\(MoneyText.approx(SubscriptionList.monthly(active, model), model.base)) a month").fontWeight(.semibold)
            }
            .font(.sans(14.5))
            if let ahead = SubscriptionList.ahead(active, model), ahead.days > 0 {
                HStack {
                    Text("across the \(ahead.days) days left")
                    Spacer()
                    Text(MoneyText.approx(ahead.total, model.base))
                }
                .font(.sans(13)).foregroundStyle(Palette.tx2)
            }
        }
        .padding(.top, 4)
    }

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 0) { content() }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
    }
}
