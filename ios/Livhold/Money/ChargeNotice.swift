import SwiftUI

/// Petra's safeguard for the subscription charges the app writes by itself
/// (web ChargeNotice.tsx, Patrik 24 Sep, #37). Each one is announced in the
/// toast's dark pill and stays until tapped, because it may need an answer:
/// "Cancelled it?" asks in the same pill, then removes the charge and marks the
/// subscription cancelled on that date. So a subscription cancelled outside the
/// app shows up at its next charge instead of adding money nobody spent.
///
/// One at a time, oldest first. Seen charges are remembered on the device, so
/// each traveller sees each charge once, whoever's phone wrote it. Only the last
/// 30 days are announced. Editors only, since the answer writes.
struct ChargeNotice: View {
    @Environment(TripStore.self) private var store
    @Environment(MoneyEditor.self) private var editor
    @State private var seen: [String] = ChargeNotice.readSeen()
    /// The charge whose "Cancelled it?" is being asked.
    @State private var asking: String?

    private static let key = "lv-sub-charges-seen"

    var body: some View {
        Group {
            if let trip = store.trip, store.canEdit, let e = next(trip) {
                pill(e, trip)
                    .id(e.id)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.timingCurve(0.2, 0.7, 0.2, 1, duration: 0.3), value: store.trip.flatMap(next)?.id)
    }

    private func next(_ trip: TripRow) -> LedgerEntry? {
        let today = Days.today()
        let from = Days.add(today, -30)
        return trip.ledger
            .filter { $0.source?.kind == "sub" && $0.date >= from && $0.date <= today && !seen.contains($0.id) }
            .min { $0.date < $1.date }
    }

    private func pill(_ e: LedgerEntry, _ trip: TripRow) -> some View {
        let subs: [Subscription] = {
            guard case .array(let items)? = trip.rawState["subscriptions"] else { return [] }
            return items.compactMap(Subscription.init(raw:))
        }()
        let sub = subs.first { $0.id == e.subId }
        var rates = trip.state.rates
        rates[trip.state.meta.baseCurrency] = 1
        let name = e.note.isEmpty ? String(localized: "A subscription") : e.note
        let amount = MoneyText.full(Journey.toBase(e.amount, e.currency, rates), trip.state.meta.baseCurrency)
        let date = Days.short(e.date)

        return VStack(alignment: .leading, spacing: 10) {
            if asking == e.id {
                Text("**Cancelled \(name)?** This \(amount) charge is removed, and \(name) is marked cancelled from \(date), so no more are added.")
                HStack(spacing: 8) {
                    Spacer()
                    button("No", filled: false) { asking = nil }
                    button("Yes, remove it", filled: true) { cancelled(e, sub) }
                }
            } else {
                Text("**\(name) · \(amount)** added to All entries, charged \(date).")
                HStack(spacing: 8) {
                    Spacer()
                    if let sub, !sub.isCancelled {
                        button("Cancelled it?", filled: false) { withAnimation(Motion.quick) { asking = e.id } }
                    }
                    button("OK", filled: true) { done(e) }
                }
            }
        }
        .font(.sans(16))
        .foregroundStyle(Palette.canvas)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, 12)
        .background(Palette.tx, in: .rect(cornerRadius: 20))
        .shadow(color: .black.opacity(0.2), radius: 12, y: 4)
        .padding(.horizontal, 18)
    }

    private func button(_ title: LocalizedStringKey, filled: Bool, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.sans(16, weight: .semibold))
                .foregroundStyle(filled ? Palette.tx : Palette.canvas)
                .padding(.horizontal, 18)
                .frame(minHeight: 44)
                .background(filled ? Palette.canvas : .clear, in: .capsule)
                .overlay(Capsule().strokeBorder(filled ? .clear : Palette.canvas.opacity(0.4), lineWidth: 1.5))
        }
        .buttonStyle(.plain)
    }

    private func done(_ e: LedgerEntry) {
        seen.append(e.id)
        Self.writeSeen(seen)
    }

    /// Removes the charge and marks the subscription cancelled from its date, so
    /// no later charge is added either.
    private func cancelled(_ e: LedgerEntry, _ sub: Subscription?) {
        done(e)
        asking = nil
        Task {
            do {
                if let sub, !sub.isCancelled {
                    try await store.save { $0.upsert("subscriptions", id: sub.id, ["cancelledOn": .string(e.date)]) }
                }
                // Deleting a charge the app wrote also lists it in importSkip.
                try await store.deleteEntry(e)
            } catch {
                editor.toast = error.localizedDescription
            }
        }
    }

    private static func readSeen() -> [String] {
        UserDefaults.standard.stringArray(forKey: key) ?? []
    }

    private static func writeSeen(_ ids: [String]) {
        UserDefaults.standard.set(Array(ids.suffix(300)), forKey: key)
    }
}
