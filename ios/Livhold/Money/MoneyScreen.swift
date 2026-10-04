import Charts
import SwiftUI

// Money on iOS (Money mock round 2, approved by Patrik on 27 Sep with the gaps
// left as issues): the top card, Latest, Daily spend and Where it goes as the
// web has them, Plan by stop with its sums, then Bookings and Subscriptions,
// always open (Patrik, 29 Sep: no card folds; Subscriptions shows its next three
// and opens a page of its own, like Latest). Tracking lives in Settings → Money; with it off the page shows what's
// committed and an invitation. Numbers come from MoneyModel (the web's maths).

struct MoneyScreen: View {
    @Environment(TripStore.self) private var store
    @Environment(TabRouter.self) private var router
    @Environment(MoneyEditor.self) private var editor

    /// "Not now" isn't an answer: a swipe closes the question until the next launch.
    @State private var askedThisLaunch = false

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    content.id("top")
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
            .refreshable {
                async let t: Void = store.refreshTracking()
                await store.refresh()
                await t
            }
            .background(Palette.canvas.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .onChange(of: router.scrollToTop[.money]) {
                withAnimation(Motion.settle) { proxy.scrollTo("top", anchor: .top) }
            }
        }
        .sheet(isPresented: Binding(
            get: { store.tracking == .ask && !askedThisLaunch && store.phase == .ready && router.selection == .money },
            set: { if !$0 { askedThisLaunch = true } }
        )) {
            TrackQuestion { askedThisLaunch = true }
        }
    }

    @ViewBuilder private var content: some View {
        switch store.phase {
        case .loading:
            VStack(spacing: 14) {
                TravelLoader()
                Text("Getting your journey").font(.sans(15)).foregroundStyle(Palette.tx2)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 180)
        case .empty:
            VStack(alignment: .leading, spacing: 12) {
                Text("Money").font(.serif(28)).foregroundStyle(Palette.tx)
                Text("No journey yet. Start one on Trip, and its money shows up here.")
                    .font(.sans(16)).foregroundStyle(Palette.tx2)
                Button("Go to Trip") { withAnimation(.easeInOut(duration: 0.3)) { router.select(.trip) } }
                    .buttonStyle(.primary)
            }
            .padding(.top, 40)
        case .failed:
            VStack(alignment: .leading, spacing: 14) {
                Text("Money").font(.serif(28)).foregroundStyle(Palette.tx)
                Notice(verbatim: store.error ?? String(localized: "Couldn’t load your journey."), kind: .warn)
                Button("Try again") { Task { await store.refresh() } }.buttonStyle(.primary)
            }
            .padding(.top, 20)
        case .ready:
            if let trip = store.trip {
                MoneyPage(model: MoneyModel(trip: trip, ledger: trip.ledger, cities: store.cityCosts, today: Days.today()))
            }
        }
    }
}

private struct MoneyPage: View {
    let model: MoneyModel

    @Environment(TripStore.self) private var store
    @Environment(MoneyEditor.self) private var editor
    /// The days Daily spend and Where it goes look at, together.
    @State private var range = 14
    @State private var end: String?

    /// The quiet page: tracking off, or not answered and nothing typed yet (tracking.ts isQuiet).
    private var quiet: Bool {
        store.tracking == .no || (store.tracking == .ask && !model.ledger.contains { $0.source == nil })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            if quiet {
                BookingsCard(model: model)
                SubscriptionsCard(model: model)
                if !model.ledger.isEmpty {
                    NavigationLink(value: Route.moneyEntries(nil)) {
                        HStack {
                            CardLabel("All entries")
                            Spacer()
                            Text("\(model.ledger.count)").font(.sans(13.5)).foregroundStyle(Palette.tx2)
                            Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.tx3)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 16)
                        .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
                    }
                    .buttonStyle(.plain)
                }
                InviteCard()
            } else {
                TopCard(model: model)
                // Upcoming charges above Latest, before departure and on the road (#149).
                if !model.upcoming.isEmpty {
                    UpcomingCard(model: model)
                }
                LatestCard(model: model)
                // Before departure: no daily charts and no line about them (#149).
                if !model.beforeDeparture {
                    if model.unlocks.chart {
                        DailySpendCard(model: model, range: $range, end: $end)
                    }
                    if model.unlocks.whereItGoes {
                        WhereItGoesCard(model: model, range: $range, end: $end)
                    }
                }
                if model.beforeDeparture || model.unlocks.projection {
                    PlanCard(model: model)
                }
                if !model.beforeDeparture && (!model.unlocks.chart || !model.unlocks.projection) {
                    Text("More appears as you log: a chart after 3 days, a projection after a week.")
                        .font(.sans(13)).foregroundStyle(Palette.tx3)
                        .padding(.horizontal, 4)
                }
                BookingsCard(model: model)
                SubscriptionsCard(model: model)
            }
        }
        .animation(Motion.settle, value: quiet)
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Money").font(.serif(30)).foregroundStyle(Palette.tx)
                Text(Journey.kicker(model.state, today: model.today).isEmpty
                     ? (model.state.meta.tripName ?? "")
                     : "\(model.state.meta.tripName ?? String(localized: "Journey")) · \(Journey.kicker(model.state, today: model.today).lowercasedFirst)")
                    .font(.sans(13)).foregroundStyle(Palette.tx2)
                    .lineLimit(1)
            }
            Spacer()
            if store.canEdit {
                Button { editor.target = .add(.expense) } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Palette.ac2)
                        .frame(width: 42, height: 42)
                        .background(.regularMaterial, in: .circle)
                        .overlay(Circle().strokeBorder(Palette.ln, lineWidth: 1))
                }
                .accessibilityLabel("Add expense")
            }
        }
        .padding(.horizontal, 2)
        .padding(.bottom, 4)
    }
}

// MARK: - shared bits

/// A card's small uppercase title; mauve on the cards the web titles in mauve.
struct CardLabel: View {
    let text: Text
    var mauve = false

    init(_ key: LocalizedStringKey, mauve: Bool = false) {
        self.text = Text(key)
        self.mauve = mauve
    }

    /// Words already made in code (String(localized:), a city).
    init(verbatim text: String, mauve: Bool = false) {
        self.text = Text(verbatim: text)
        self.mauve = mauve
    }

    var body: some View {
        text
            .font(.sans(11.5, weight: .semibold, relativeTo: .caption))
            .textCase(.uppercase)
            .tracking(1.3)
            .foregroundStyle(mauve ? Palette.ac2 : Palette.tx3)
    }
}

/// A plain row that reads like a list row on a card.
private struct Line<Trailing: View>: View {
    let title: LocalizedStringKey
    var detail: String? = nil
    var detailTone: Color = Palette.tx2
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.sans(15, weight: .medium)).foregroundStyle(Palette.tx).lineLimit(1)
                if let detail { Text(detail).font(.sans(12.5)).foregroundStyle(detailTone).lineLimit(2) }
            }
            Spacer(minLength: 8)
            trailing
        }
        .padding(.vertical, 9)
    }
}

extension String {
    var lowercasedFirst: String { prefix(1).lowercased() + dropFirst() }
    var capitalisedFirst: String { prefix(1).uppercased() + dropFirst() }
}

// MARK: - top card

/// This stop or the whole journey (Patrik, 27 Sep, #114); before departure, the
/// estimate alone (#149). Journey is the money-on-the-road mock's version B (4 Oct).
private struct TopCard: View {
    let model: MoneyModel

    /// The stop and the whole journey; Today went on 27 Sep (Patrik).
    enum View: String, CaseIterable, Identifiable { case here = "Here", journey = "Journey"; var id: Self { self } }
    @AppStorage("money.topView") private var view: View = .journey
    @Environment(TabRouter.self) private var router
    @Environment(\.colorScheme) private var scheme
    /// Spent so far, opened to where it was spent.
    @State private var spentOpen = false

    /// A travel day has no stop, so it opens on Journey (#149); the switch still works.
    @State private var travelPick: View?

    private var shown: View { model.currentPlan == nil ? (travelPick ?? .journey) : view }

    var body: some SwiftUI.View {
        VStack(alignment: .leading, spacing: 12) {
            if model.beforeDeparture {
                // Before departure: the planned journey's estimate, no switch (#149).
                estimate
            } else {
                Picker("Show", selection: Binding(
                    get: { shown },
                    set: { v in withAnimation(Motion.settle) { if model.currentPlan == nil { travelPick = v } else { view = v } } }
                )) {
                    ForEach(View.allCases) { Text(title($0)).tag($0) }
                }
                .pickerStyle(.segmented)
                Group {
                    switch shown {
                    case .here: here
                    case .journey: journey
                    }
                }
                .transition(.opacity)
            }
        }
        .padding(16)
        .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
        .sensoryFeedback(.selection, trigger: shown)
    }

    // MARK: parts and the ring

    /// One row under the headline and its arc on the ring, in the same order.
    struct Part: Identifiable {
        let id: String
        let title: Text
        let value: Double
        let color: Color
        var hatched = false
        /// An estimate reads "≈"; money already spent or booked reads in full.
        var approx = true
    }

    private func ring(_ parts: [Part], spent: Double) -> some SwiftUI.View {
        Button { router.paths[.money, default: []].append(.moneySettings) } label: {
            BudgetRing(arcs: parts.map { .init(value: $0.value, color: $0.color, hatched: $0.hatched) },
                       budget: model.cap, spent: spent)
        }
        .buttonStyle(.plain)
        .accessibilityHint("Opens Money settings")
    }

    private func partRow(_ part: Part) -> some SwiftUI.View {
        legendRow(part.title, part.approx ? MoneyText.approx(part.value, model.base) : MoneyText.full(part.value, model.base),
                  swatch: part.color, hatched: part.hatched)
    }

    /// The budget, then what's left in it or how far over it the estimate goes:
    /// a fact, amber when over, never red. Before departure what's left goes to
    /// the days nothing is planned for (#149 Q6).
    @ViewBuilder private func budgetRows(_ p: MoneyModel.Projection, total: Double, unplanned: Bool) -> some SwiftUI.View {
        if let cap = model.cap {
            Divider().overlay(Palette.ln)
            Button { router.paths[.money, default: []].append(.moneySettings) } label: {
                legendRow(Text("Budget"), MoneyText.full(cap, model.base), swatch: nil)
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens Money settings")
            let left = cap - total
            if left < 0 {
                legendRow(Text("Over budget"), MoneyText.approx(-left, model.base), swatch: Palette.warn, bold: true, tone: Palette.warn)
            } else if unplanned, p.unplannedDays > 0, let end = model.planEnd {
                VStack(spacing: 2) {
                    legendRow(Text("Left for \(p.unplannedDays) unplanned days"), MoneyText.approx(left, model.base), swatch: nil, bold: true)
                    legendRow(Text("after \(Days.short(end))"), String(localized: "\(MoneyText.approx(left / Double(p.unplannedDays), model.base)) a day"),
                              swatch: nil, small: true)
                }
            } else {
                legendRow(Text("Left in the budget"), MoneyText.approx(left, model.base), swatch: nil, bold: true)
            }
        }
    }

    // MARK: before departure

    /// Estimated total for the planned nights, its parts on the ring against the
    /// budget, and what the budget leaves for the days nothing is planned for
    /// (Patrik, 3 Oct, #149; the ring instead of the bar, 4 Oct). The unplanned
    /// days aren't priced; no "a day less" advice.
    private var estimate: some SwiftUI.View {
        let p = model.projection
        let nights = model.plan.reduce(0) { $0 + $1.nights }
        let parts = [
            Part(id: "paid", title: Text("Paid"), value: p.spent, color: Palette.ac, approx: false),
            Part(id: "due", title: Text("Still to pay"), value: p.toPay, color: Palette.ac2, approx: false),
            Part(id: "ahead", title: Text("Day to day"), value: p.ahead, color: Palette.ln3),
            Part(id: "stays", title: Text("Stays not booked yet"), value: p.staysEstimated, color: Palette.warnLine),
            Part(id: "subs", title: Text("Subscriptions"), value: p.subsAhead, color: Palette.tx3),
        ].filter { $0.value > 0 || $0.id == "paid" }
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    CardLabel("Estimated total")
                    big(MoneyText.approx(p.projected, model.base), value: p.projected)
                    if nights > 0, let end = model.planEnd {
                        Text("the \(nights) planned nights, to \(Days.short(end))")
                            .font(.sans(13)).foregroundStyle(Palette.tx2)
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        Text("Add stops on Trip and their nights are estimated here.")
                            .font(.sans(13)).foregroundStyle(Palette.tx2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                ring(parts, spent: p.spent)
            }
            VStack(spacing: 7) {
                ForEach(parts) { partRow($0) }
                budgetRows(p, total: p.projected, unplanned: true)
            }
            if let leg = model.unbookedLegs.first {
                (model.unbookedLegs.count == 1
                 ? Text("\(leg.from) → \(leg.to) isn’t booked yet, so it isn’t counted.")
                 : Text("\(model.unbookedLegs.count) legs aren’t booked yet, so they aren’t counted."))
                    .font(.sans(13)).foregroundStyle(Palette.warn)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if model.plan.contains(where: { !$0.fromPace && $0.rate > 0 }) {
                // "Checked regularly" once city prices are dated and checked (#148).
                Text("Day to day uses city averages from June 2026. It’s an approximate projection: what you really spend depends on how you travel.")
                    .font(.sans(12)).foregroundStyle(Palette.tx3)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// A label cut short before its amount ever wraps (#149: amounts keep their currency on one line).
    private func legendRow(_ title: Text, _ value: String, swatch: Color?, hatched: Bool = false, bold: Bool = false,
                           small: Bool = false, tone: Color = Palette.tx, chevron: Double? = nil) -> some SwiftUI.View {
        HStack(spacing: 8) {
            if let swatch {
                RoundedRectangle(cornerRadius: 2.5)
                    .fill(hatched ? AnyShapeStyle(Stripes.paint(swatch, scheme)) : AnyShapeStyle(swatch))
                    .frame(width: 9, height: 9)
            }
            title.lineLimit(1).truncationMode(.tail)
                .foregroundStyle(small ? Palette.tx3 : (bold ? tone : Palette.tx2))
            Spacer(minLength: 8)
            Text(value).fixedSize()
                .foregroundStyle(small ? Palette.tx3 : tone)
            if let chevron {
                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Palette.tx3)
                    .rotationEffect(.degrees(chevron))
            }
        }
        .font(.sans(small ? 12.5 : 14, weight: bold ? .semibold : .regular))
        .contentShape(.rect)
    }

    /// The middle tab is the stop's city (Patrik, 27 Sep); a name too long for a
    /// third of the control, or no stop today, reads "This stop".
    private func title(_ v: View) -> String {
        guard v == .here else { return String(localized: "Journey") }
        guard let city = model.currentPlan?.seg.city, city.count <= 12 else { return String(localized: "This stop") }
        return city
    }

    private func big(_ text: String, value: Double) -> some SwiftUI.View {
        Text(text)
            .font(.sans(34, weight: .semibold, relativeTo: .largeTitle))
            .foregroundStyle(Palette.ac2)
            .contentTransition(.numericText(value: value))
            .animation(Motion.settle, value: value)
            .minimumScaleFactor(0.7)
            .lineLimit(1)
    }

    private func tile(_ label: LocalizedStringKey, _ value: String, _ detail: String?, tone: Color = Palette.tx2) -> some SwiftUI.View {
        VStack(alignment: .leading, spacing: 2) {
            CardLabel(label)
            Text(value).font(.sans(19, weight: .semibold)).foregroundStyle(Palette.tx)
                .contentTransition(.numericText()).lineLimit(1).minimumScaleFactor(0.8)
            if let detail { Text(detail).font(.sans(12.5)).foregroundStyle(tone).fixedSize(horizontal: false, vertical: true) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: journey

    /// Where the journey lands, headline beside the ring, and the parts that add
    /// up to it, each a row and an arc (Patrik, 4 Oct, money-on-the-road mock,
    /// version B: no "+" or "=", people don't like maths). Spent so far opens to
    /// where it was spent. Until the projection unlocks (a week of pace on new
    /// journeys), only what's spent and what's still to pay.
    private var journey: some SwiftUI.View {
        let p = model.projection
        let projecting = model.unlocks.projection
        var parts = [
            Part(id: "due", title: Text("Still to pay"), value: p.toPay, color: Palette.ac2, approx: false),
        ]
        if projecting {
            parts += [
                Part(id: "ahead", title: Text("Day to day, \(p.remainingNights) nights"), value: p.ahead, color: Palette.ln3),
                Part(id: "stays", title: Text("Stays not booked yet"), value: p.staysEstimated, color: Palette.warnLine),
                Part(id: "after", title: Text("After the plan, \(p.unplannedDays) days"), value: p.unplanned, color: Palette.ln3, hatched: true),
                Part(id: "subs", title: Text("Subscriptions"), value: p.subsAhead, color: Palette.tx3),
            ]
        }
        parts = parts.filter { $0.value > 0 }
        let spentPart = Part(id: "spent", title: Text("Spent so far"), value: p.spent, color: Palette.ac, approx: false)
        let total = projecting ? p.projected : p.spent + p.toPay
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    if projecting {
                        CardLabel("Lands near")
                        big(MoneyText.approx(p.projected, model.base), value: p.projected)
                    } else {
                        CardLabel("Spent so far")
                        big(MoneyText.short(p.spent, model.base), value: p.spent)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                ring([spentPart] + parts, spent: p.spent)
            }
            VStack(spacing: 7) {
                spentRow(spentPart)
                ForEach(parts) { partRow($0) }
                if projecting {
                    budgetRows(p, total: total, unplanned: false)
                } else if let cap = model.cap {
                    Divider().overlay(Palette.ln)
                    legendRow(Text("Budget"), MoneyText.full(cap, model.base), swatch: nil)
                }
            }
            if projecting, let lessLine = lessPerDay(p) {
                Text(lessLine).font(.sans(13)).foregroundStyle(Palette.warn)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Divider().overlay(Palette.ln)
            paceLine
        }
    }

    /// Spent so far, and under it where: before departure, each stop by date,
    /// between stops (Patrik, 4 Oct). Each opens All entries on those days.
    private func spentRow(_ part: Part) -> some SwiftUI.View {
        let breakdown = model.spentParts
        return VStack(spacing: 6) {
            Button { withAnimation(Motion.settle) { spentOpen.toggle() } } label: {
                legendRow(part.title, MoneyText.full(part.value, model.base), swatch: part.color,
                          chevron: breakdown.isEmpty ? nil : (spentOpen ? 180 : 0))
            }
            .buttonStyle(.plain)
            .disabled(breakdown.isEmpty)
            .accessibilityHint(spentOpen ? "Hides where it was spent" : "Shows where it was spent")
            if spentOpen {
                VStack(spacing: 0) {
                    ForEach(breakdown) { s in
                        NavigationLink(value: Route.moneyEntries(focus(s))) {
                            HStack(spacing: 8) {
                                spentTitle(s).lineLimit(1).truncationMode(.tail).foregroundStyle(Palette.tx2)
                                Spacer(minLength: 8)
                                Text(MoneyText.full(s.total, model.base)).fixedSize().foregroundStyle(Palette.tx)
                                Image(systemName: "chevron.right").font(.system(size: 10, weight: .semibold)).foregroundStyle(Palette.tx3)
                            }
                            .font(.sans(13))
                            .padding(.vertical, 6)
                            .contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 2)
                .background(Palette.canvas, in: .rect(cornerRadius: 10))
                .padding(.leading, 17)
                .expands()
            }
        }
    }

    private func spentTitle(_ s: MoneyModel.SpentPart) -> Text {
        switch s.kind {
        case .before: Text("Before departure")
        case .between: Text("Between stops")
        case .stop: s.isCurrent ? Text("\(s.city ?? "") so far") : Text(verbatim: s.city ?? "")
        }
    }

    private func focus(_ s: MoneyModel.SpentPart) -> String? {
        switch s.kind {
        case .before: "before"
        case .between: nil
        case .stop: s.from.flatMap { from in s.to.map { "span:\(from):\($0)" } }
        }
    }

    /// The everyday pace: at this stop after three days there, else since departure.
    private var paceLine: some SwiftUI.View {
        let title: Text
        let value: String
        if let perDay = model.pace.perDay {
            title = model.pace.scope == .stop
                ? (model.current.map { Text("Your pace in \($0.city)") } ?? Text("Your pace at this stop"))
                : Text("Your pace since departure")
            value = String(localized: "\(MoneyText.full(perDay, model.base)) a day")
        } else {
            title = Text("Your pace")
            value = model.tripDay.map { String(localized: "measuring, \(min($0, 3)) of 3 days") } ?? String(localized: "measuring…")
        }
        return HStack(spacing: 8) {
            title.lineLimit(1).foregroundStyle(Palette.tx2)
            Spacer(minLength: 8)
            Text(value).fixedSize().fontWeight(.semibold).foregroundStyle(Palette.tx)
        }
        .font(.sans(13.5))
    }

    /// Over the budget: what a day would need to cost less, amber, never red (Patrik, 27 Sep).
    private func lessPerDay(_ p: MoneyModel.Projection) -> String? {
        guard let cap = model.cap, p.projected > cap, p.daysAhead > 0 else { return nil }
        let less = (p.projected - cap) / Double(p.daysAhead)
        return String(localized: "About \(MoneyText.full((less / 50).rounded(.up) * 50, model.base)) a day less gets you there.")
    }

    // MARK: here

    @ViewBuilder private var here: some SwiftUI.View {
        if let row = model.currentPlan {
            let local = MoneyModel.burnRate(model.ledger, model.rates, from: row.seg.arrive, to: min(model.today, row.seg.depart))
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    CardLabel("\(row.seg.city) · night \(max(1, row.nightsIn)) of \(row.nights)")
                    big(MoneyText.short(row.spent, model.base), value: row.spent)
                    Text("everyday costs here so far").font(.sans(13)).foregroundStyle(Palette.tx2)
                }
                HStack(alignment: .top, spacing: 12) {
                    tile("Per day here", MoneyText.full(local.perDay, model.base), String(localized: "over \(local.days) days"))
                    tile("The stop comes to", MoneyText.approx(row.projected, model.base), PlanCard.includedWords(row.stayLabel),
                         tone: row.stayLabel == .idea || row.stayLabel == .none ? Palette.warn : Palette.tx2)
                }
                StopBar(row: row)
                // What this stop cost beyond the everyday, by date (Patrik, 4 Oct: off
                // the Journey card, onto the stop's).
                let beyond = model.beyondEveryday(at: row.seg)
                if beyond > 0 {
                    Divider().overlay(Palette.ln)
                    NavigationLink(value: Route.moneyEntries("beyond:\(row.seg.arrive):\(min(model.today, row.seg.depart))")) {
                        HStack {
                            Text("+ \(MoneyText.full(beyond, model.base)) beyond the everyday here")
                                .font(.sans(13.5)).foregroundStyle(Palette.tx2)
                                .lineLimit(1).minimumScaleFactor(0.85)
                            Spacer()
                            Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.tx3)
                        }
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 6) {
                CardLabel("Here")
                Text("Between stops today.").font(.serif(19)).foregroundStyle(Palette.tx)
                Text("The stop view comes back when you arrive somewhere on the plan.")
                    .font(.sans(13)).foregroundStyle(Palette.tx2)
            }
        }
    }
}

/// The stop's nights: today above the bar where it stands, arrival and
/// departure under its ends (Patrik, 27 Sep: the bar had no words).
private struct StopBar: View {
    let row: MoneyModel.PlanRow

    var body: some View {
        let nights = max(1, row.nights)
        let done = min(row.nightsIn, nights)
        VStack(alignment: .leading, spacing: 5) {
            GeometryReader { geo in
                let w = geo.size.width
                // Over the middle of tonight's night, kept inside the card.
                let x = done > 0 ? w * (Double(done) - 0.5) / Double(nights) : 0
                Text("today")
                    .font(.sans(12, weight: .semibold)).foregroundStyle(Palette.ac2)
                    .fixedSize()
                    .alignmentGuide(.leading) { d in -min(max(0, x - d.width / 2), w - d.width) }
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(height: 15)
            bar(nights: nights, done: done)
            HStack(alignment: .firstTextBaseline) {
                Text("in \(Days.short(row.seg.arrive))")
                Spacer()
                row.remaining > 0
                    ? Text("\(row.remaining) nights left · out \(Days.short(row.seg.depart))")
                    : Text("last night · out \(Days.short(row.seg.depart))")
            }
            .font(.sans(12.5)).foregroundStyle(Palette.tx2)
        }
        .accessibilityElement(children: .combine)
    }

    /// One segment a night while they fit; a plain bar for long stays.
    @ViewBuilder private func bar(nights: Int, done: Int) -> some View {
        if nights <= 31 {
            HStack(spacing: 2) {
                ForEach(0..<nights, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 2.5)
                        .fill(i < done ? Palette.ac : Palette.tr)
                        .opacity(i == done - 1 ? 1 : (i < done ? 0.75 : 1))
                }
            }
            .frame(height: 10)
            .animation(Motion.settle, value: done)
        } else {
            ProgressTrack(value: Double(done) / Double(nights))
        }
    }
}

// MARK: - upcoming charges

/// Every charge dated ahead but the subscriptions, three soonest, the total in
/// the corner; Latest's row style, each row opening its booking's form (#149).
private struct UpcomingCard: View {
    let model: MoneyModel
    @Environment(TripStore.self) private var store
    @Environment(TripEditor.self) private var trips
    @Environment(MoneyEditor.self) private var editor

    var body: some View {
        let all = model.upcoming
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                CardLabel("Upcoming charges", mauve: true)
                Spacer()
                Text(MoneyText.full(all.reduce(0) { $0 + $1.amount }, model.base))
                    .font(.sans(13, weight: .medium)).foregroundStyle(Palette.tx2)
            }
            .padding(.bottom, 4)
            ForEach(Array(all.prefix(3).enumerated()), id: \.element.id) { i, u in
                if i > 0 { Divider().overlay(Palette.ln) }
                Button { open(u) } label: { row(u) }
                    .buttonStyle(.plain)
                    .disabled(!store.canEdit)
            }
            if all.count > 3 {
                Divider().overlay(Palette.ln)
                NavigationLink(value: Route.moneyEntries(nil)) {
                    Text("\(all.count - 3) more in All entries ›")
                        .font(.sans(13.5, weight: .medium)).foregroundStyle(Palette.ac)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 10)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
    }

    private func row(_ u: MoneyModel.Upcoming) -> some View {
        HStack(spacing: 12) {
            CategoryTile(id: u.category, size: 32)
            VStack(alignment: .leading, spacing: 1) {
                Text(u.title).font(.sans(15, weight: .medium)).foregroundStyle(Palette.tx).lineLimit(1)
                Text(detail(u)).font(.sans(12.5)).foregroundStyle(Palette.tx2).lineLimit(1).minimumScaleFactor(0.85)
            }
            Spacer(minLength: 8)
            Text(MoneyText.full(u.amount, model.base))
                .font(.sans(15, weight: .semibold)).foregroundStyle(Palette.tx)
                .fixedSize()
        }
        .padding(.vertical, 9)
        .frame(minHeight: 56)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }

    /// "15 Sep · in 16 days", "13 Nov, at check-in · Da Nang".
    private func detail(_ u: MoneyModel.Upcoming) -> String {
        let day = u.atCheckIn ? String(localized: "\(Days.short(u.date)), at check-in") : Days.short(u.date)
        if let city = u.city { return "\(day) · \(city)" }
        let n = Days.between(model.today, u.date)
        return n == 1 ? "\(day) · " + String(localized: "tomorrow") : "\(day) · " + String(localized: "in \(n) days")
    }

    private func open(_ u: MoneyModel.Upcoming) {
        let state = model.state
        switch u.opens {
        case .entry(let e):
            editor.target = .edit(e)
        case .stay(let id):
            guard let stay = state.stays.first(where: { $0.id == id }),
                  let seg = state.segments.first(where: { $0.id == stay.segId }) else { return }
            trips.open(.stay(stay, seg: seg, range: nil))
        case .transport(let id):
            guard let leg = state.transport.first(where: { $0.id == id }) else { return }
            trips.open(.transport(leg, from: leg.from, to: leg.to, date: leg.date ?? ""))
        }
    }
}

// MARK: - latest

private struct LatestCard: View {
    let model: MoneyModel
    @Environment(MoneyEditor.self) private var editor
    @Environment(TripStore.self) private var store
    @Environment(\.tabZoom) private var zoom

    var body: some View {
        let rows = Array(model.latest.prefix(3))
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                CardLabel("Latest", mauve: true)
                Spacer()
                NavigationLink(value: Route.moneyEntries(nil)) {
                    Text("All entries").font(.sans(13.5, weight: .medium)).foregroundStyle(Palette.ac)
                    + Text(verbatim: " ›").font(.sans(13.5, weight: .medium)).foregroundStyle(Palette.ac)
                }
            }
            .padding(.bottom, rows.isEmpty ? 0 : 4)
            if rows.isEmpty {
                Text("Nothing typed yet. Tap + to log the first thing you buy.")
                    .font(.sans(14)).foregroundStyle(Palette.tx2)
                    .padding(.vertical, 10)
            }
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, e in
                if i > 0 { Divider().overlay(Palette.ln) }
                Button { if store.canEdit { editor.target = .edit(e) } } label: {
                    EntryRow(entry: e, model: model, dateStyle: .relative)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
        .modifier(ZoomSource(id: "entries", namespace: zoom))
    }
}

/// One ledger row: the category tile, the name, the category and a detail, the amount.
struct EntryRow: View {
    enum DateStyle { case relative, none }
    let entry: LedgerEntry
    let model: MoneyModel
    var dateStyle: DateStyle = .none

    var body: some View {
        let base = Journey.toBase(entry.amount, entry.currency, model.rates)
        HStack(spacing: 12) {
            CategoryTile(id: entry.category, size: 32, hollow: hollow, badge: badge)
            VStack(alignment: .leading, spacing: 1) {
                Text(entry.note.isEmpty ? Categories.label(entry.category) : entry.note)
                    .font(.sans(15, weight: .medium)).foregroundStyle(Palette.tx).lineLimit(1)
                if let detail {
                    Text(detail).font(.sans(12.5)).foregroundStyle(entry.orphaned ? Palette.warn : Palette.tx2).lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            Text((entry.type == .income ? "+" : "") + MoneyText.full(base, model.base))
                .font(.sans(15, weight: .semibold))
                .foregroundStyle(entry.type == .income ? Palette.ac : Palette.tx)
        }
        .padding(.vertical, 9)
        .frame(minHeight: 56)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityValue(Categories.label(entry.category))
    }

    /// Out of the daily average by its own switch.
    private var hollow: Bool {
        entry.source == nil && Categories.isEveryday(entry.category) && !isEverydayRow(entry) && entry.isExpense
    }

    private var badge: String? {
        switch entry.source?.kind {
        case "sub": "arrow.clockwise"
        case "stay", "transport": "link"
        default: nil
        }
    }

    /// The day, the original charge, and why it's here when that isn't obvious.
    /// No category: the tile shows it (Patrik, 28 Sep: fewer facts per row).
    private var detail: String? {
        var parts: [String] = []
        if dateStyle == .relative { parts.append(MoneyText.day(entry.date, today: model.today)) }
        if entry.currency != model.base, !entry.currency.isEmpty { parts.append(MoneyText.original(entry)) }
        if entry.orphaned { parts.append(String(localized: "booking removed")) }
        else if entry.source?.kind == "sub" { parts.append(String(localized: "added by itself")) }
        else if entry.isImported { parts.append(String(localized: "from booking")) }
        else if hollow { parts.append(String(localized: "not in daily average")) }
        else if entry.source == nil, entry.isExpense, !Categories.isEveryday(entry.category), isEverydayRow(entry) { parts.append(String(localized: "in daily average")) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

// MARK: - daily spend

/// 7, 14, 30 or 90 days and the arrows to page back through them; Daily spend
/// and Where it goes share one, so both cards look at the same days.
private struct RangeBar: View {
    let model: MoneyModel
    @Binding var range: Int
    @Binding var end: String?

    var body: some View {
        let window = model.window(range: range, end: end)
        HStack(spacing: 6) {
            pager("chevron.left", enabled: window.from > model.earliestDate) { page(-1, window) }
            Picker("Days", selection: $range.animation(Motion.settle)) {
                ForEach([7, 14, 30, 90], id: \.self) { Text("\($0)d").tag($0) }
            }
            .pickerStyle(.segmented)
            .onChange(of: range) { end = nil }
            pager("chevron.right", enabled: window.to < model.today) { page(1, window) }
        }
    }

    private func pager(_ symbol: String, enabled: Bool, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).font(.system(size: 13, weight: .semibold)).frame(width: 28, height: 28)
        }
        .foregroundStyle(enabled ? Palette.tx2 : Palette.tx3.opacity(0.4))
        .disabled(!enabled)
    }

    private func page(_ dir: Int, _ window: (from: String, to: String)) {
        let next = Days.add(window.to, dir * range)
        withAnimation(Motion.settle) { end = next >= model.today ? nil : next }
    }
}

/// Taps and hold-then-drag on a chart, through UIKit so they share the touch
/// with the page's scrolling: a finger that moves before the hold is a scroll.
private struct ChartTouches: UIViewRepresentable {
    var onTap: (CGFloat) -> Void
    var onScrub: (CGFloat) -> Void

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .clear
        view.addGestureRecognizer(UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.tap(_:))))
        let hold = UILongPressGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.hold(_:)))
        hold.minimumPressDuration = 0.2
        view.addGestureRecognizer(hold)
        return view
    }

    func updateUIView(_ view: UIView, context: Context) { context.coordinator.parent = self }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    @MainActor final class Coordinator: NSObject {
        var parent: ChartTouches
        init(_ parent: ChartTouches) { self.parent = parent }

        @objc func tap(_ g: UITapGestureRecognizer) { parent.onTap(g.location(in: g.view).x) }

        @objc func hold(_ g: UILongPressGestureRecognizer) {
            guard g.state == .began || g.state == .changed else { return }
            parent.onScrub(g.location(in: g.view).x)
        }
    }
}

private struct DailySpendCard: View {
    let model: MoneyModel
    @Binding var range: Int
    @Binding var end: String?
    @State private var selected: String?
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let window = model.window(range: range, end: end)
        let days = model.daily(from: window.from, to: window.to)
        let stripes = Self.stripes(scheme)
        let start = model.tripStart ?? ""
        let counted = days.filter { $0.date >= start }
        let avgDays = counted.isEmpty ? days : counted
        let avg = avgDays.isEmpty ? 0 : avgDays.reduce(0) { $0 + $1.total } / Double(avgDays.count)
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                CardLabel("Daily spend", mauve: true)
                Spacer()
                Text("\(Days.short(window.from)) – \(Days.short(window.to))").font(.sans(12.5)).foregroundStyle(Palette.tx2)
            }
            if model.unlocks.range {
                RangeBar(model: model, range: $range, end: $end)
            }
            // Days on a real date axis: one bar per calendar day, labels only where
            // `labels` puts them. (A text axis labelled every day on some phones.)
            Chart {
                ForEach(days) { day in
                    let x = Self.day(day.date)
                    if day.total == 0 && day.other == 0 {
                        // Every day keeps its slot on the axis, spent or not.
                        BarMark(x: .value("Day", x, unit: .day), y: .value("Spent", 0))
                    } else if day.date < start {
                        BarMark(x: .value("Day", x, unit: .day), y: .value("Spent", day.total))
                            .foregroundStyle(Palette.tr)
                    } else {
                        ForEach(Family.allCases) { f in
                            if let v = day.byFamily[f], v > 0 {
                                BarMark(x: .value("Day", x, unit: .day), y: .value("Spent", v))
                                    .foregroundStyle(f.color)
                            }
                        }
                    }
                    // What stays out of the daily average still draws its bar, striped,
                    // on top of what counts (Patrik, 3 Oct, #149: the travel day was empty).
                    if day.other > 0 {
                        BarMark(x: .value("Day", x, unit: .day), y: .value("Spent", day.other))
                            .foregroundStyle(stripes)
                    }
                }
                if avg > 0 {
                    RuleMark(y: .value("Average", avg))
                        .foregroundStyle(Palette.tx3)
                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
                        .annotation(position: .top, alignment: .trailing, spacing: 2) {
                            Text("avg \(MoneyText.full(avg, model.base)) a day").font(.sans(10.5)).foregroundStyle(Palette.tx3)
                        }
                }
                if let selected {
                    RectangleMark(x: .value("Day", Self.day(selected), unit: .day))
                        .foregroundStyle(Palette.tx.opacity(0.07))
                        .zIndex(-1)
                }
            }
            // A tap picks a day, a second tap on it closes the callout. Hold, then drag,
            // and the callout follows the finger day by day, with a tick on each. A
            // swipe still scrolls the page (Patrik, 28 Sep: taps didn't register and
            // the page wouldn't scroll over the chart; SwiftUI's gestures claimed both).
            .chartOverlay { proxy in
                GeometryReader { geo in
                    let dayAt = { (x: CGFloat) -> String? in
                        guard let plot = proxy.plotFrame,
                              let date: Date = proxy.value(atX: x - geo[plot].origin.x) else { return nil }
                        return min(max(EntrySheet.iso(date), window.from), window.to)
                    }
                    ChartTouches(
                        onTap: { x in
                            guard let day = dayAt(x) else { return }
                            withAnimation(Motion.quick) { selected = selected == day ? nil : day }
                        },
                        onScrub: { x in
                            guard let day = dayAt(x), day != selected else { return }
                            selected = day
                        }
                    )
                }
            }
            .chartYAxis(.hidden)
            .chartXScale(domain: Self.day(window.from)...Self.day(Days.add(window.to, 1)))
            .chartXAxis {
                AxisMarks(values: labels(days.map(\.date)).map { Self.day($0).addingTimeInterval(12 * 3600) }) { v in
                    AxisValueLabel(anchor: .top, collisionResolution: .disabled) {
                        if let date = v.as(Date.self) {
                            let d = EntrySheet.iso(date)
                            Text(d == model.today ? String(localized: "today") : axisLabel(d))
                                .font(.sans(10.5, weight: d == model.today ? .semibold : .regular))
                                .foregroundStyle(d == model.today ? Palette.ac2 : Palette.tx3)
                                .fixedSize()
                        }
                    }
                }
            }
            .frame(height: 140)
            .animation(Motion.settle, value: window.from)
            .sensoryFeedback(.selection, trigger: selected)
            .onChange(of: window.from) { selected = nil }

            legend(days)

            // Always there and always one size, so nothing below it moves: the
            // days at a glance, or the day picked on the chart.
            ZStack(alignment: .topLeading) {
                panelTemplate.hidden()
                Group {
                    if let selected {
                        callout(selected).id(selected)
                    } else {
                        overview(days: avgDays, avg: avg, sinceStart: avgDays.count < days.count)
                    }
                }
                .transition(.opacity)
            }
            .padding(10)
            .background(Palette.canvas, in: .rect(cornerRadius: 12))
            .animation(Motion.quick, value: selected)
        }
        .padding(16)
        .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
    }

    /// Diagonal lines for the part of a bar outside the daily average.
    static func stripes(_ scheme: ColorScheme) -> ImagePaint { Stripes.paint(Palette.ac, scheme) }

    /// A ledger day as the start of that day on the phone's calendar, which is
    /// what the chart's day bins use.
    static func day(_ iso: String) -> Date {
        let p = iso.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return .now }
        return Calendar.current.date(from: DateComponents(year: p[0], month: p[1], day: p[2])) ?? .now
    }


    /// Every day for a week, every 4th for 14, every 7th for 30, month starts for 90.
    private func labels(_ dates: [String]) -> [String] {
        if range >= 90 && model.unlocks.range { return dates.filter { $0.hasSuffix("-01") } }
        // Counted back from the last day, so the newest day always has its label
        // and no two labels crowd each other.
        let step = dates.count <= 7 ? 1 : (dates.count <= 14 ? 4 : 7)
        let last = dates.count - 1
        return dates.enumerated().filter { (last - $0.offset) % step == 0 }.map(\.element)
    }

    private func axisLabel(_ d: String) -> String {
        if range >= 90 && model.unlocks.range {
            return Days.monthShort(d)
        }
        return Days.short(d)
    }

    private func callout(_ date: String) -> some View {
        let entries = model.entries(on: date)
        let total = entries.reduce(0) { $0 + Journey.toBase($1.amount, $1.currency, model.rates) }
        // The day's things as a list, full amounts (Patrik, 27 Sep: "6081 · 895" in one
        // line saved room but didn't read). The three largest; the rest are one tap away,
        // so the panel is no taller than the overview (Patrik, 29 Sep).
        let shown = entries.prefix(3)
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(MoneyText.weekday(date))
                Spacer()
                Text(MoneyText.full(total, model.base))
            }
            .font(.sans(14, weight: .semibold))
            .foregroundStyle(Palette.tx)
            if entries.isEmpty {
                Text("Nothing logged.").font(.sans(14)).foregroundStyle(Palette.tx2)
            }
            ForEach(shown) { e in
                HStack(spacing: 8) {
                    RoundedRectangle(cornerRadius: 3).fill(Categories.color(e.category)).frame(width: 9, height: 9)
                    Text(e.note.isEmpty ? Categories.label(e.category) : e.note).lineLimit(1)
                    Spacer(minLength: 8)
                    Text(MoneyText.full(Journey.toBase(e.amount, e.currency, model.rates), model.base))
                }
                .font(.sans(14))
                .foregroundStyle(Palette.tx2)
            }
            if !entries.isEmpty {
                NavigationLink(value: Route.moneyEntries(date)) {
                    (entries.count > shown.count ? Text("\(entries.count - shown.count) more in All entries ›") : Text("Open in All entries ›"))
                        .font(.sans(13.5, weight: .medium)).foregroundStyle(Palette.ac)
                }
                .padding(.top, 2)
            }
        }
    }

    /// The panel's one size: the overview's, a header, three lines and the hint.
    /// A day with three things and the link fits the same room.
    private var panelTemplate: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(verbatim: "Tue 23 Sep").font(.sans(14, weight: .semibold))
            ForEach(0..<3, id: \.self) { _ in Text(verbatim: "Row").font(.sans(14)) }
            ZStack(alignment: .leading) {
                Text("Tap a day on the chart, or hold and slide.").font(.sans(13))
                Text(verbatim: "4 more in All entries ›").font(.sans(13.5, weight: .medium))
            }
            .padding(.top, 2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Before a day is picked: what these days add up to, the biggest one a tap away.
    private func overview(days: [MoneyModel.Day], avg: Double, sinceStart: Bool) -> some View {
        let total = days.reduce(0) { $0 + $1.total }
        let biggest = days.max { $0.total < $1.total }
        let quiet = days.filter { $0.total == 0 }.count
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                sinceStart ? Text("\(days.count) days since you set off") : Text("\(days.count) days")
                Spacer()
                Text(MoneyText.full(total, model.base))
            }
            .font(.sans(14, weight: .semibold))
            .foregroundStyle(Palette.tx)
            line(Text("Average a day"), MoneyText.full(avg, model.base))
            if let biggest, biggest.total > 0 {
                Button { withAnimation(Motion.quick) { selected = biggest.date } } label: {
                    line(Text("Biggest day · \(MoneyText.weekday(biggest.date))"), MoneyText.full(biggest.total, model.base), chevron: true)
                }
                .buttonStyle(.plain)
            }
            line(Text("Days with nothing logged"), "\(quiet)")
            Text("Tap a day on the chart, or hold and slide.")
                .font(.sans(13)).foregroundStyle(Palette.tx3)
                .padding(.top, 2)
        }
    }

    private func line(_ title: Text, _ value: String, chevron: Bool = false) -> some View {
        HStack(spacing: 8) {
            title.lineLimit(1)
            Spacer(minLength: 8)
            Text(value)
            if chevron {
                Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.tx3)
            }
        }
        .font(.sans(14))
        .foregroundStyle(Palette.tx2)
        .contentShape(.rect)
    }

    private func legend(_ days: [MoneyModel.Day]) -> some View {
        // Every family, the ones missing from these days dimmed: the legend keeps
        // its lines whatever the range.
        let present = Set(Family.allCases.filter { f in days.contains { ($0.byFamily[f] ?? 0) > 0 } })
        return FlowLayout(spacing: 12, lineSpacing: 4) {
            ForEach(Family.allCases) { f in
                HStack(spacing: 5) {
                    RoundedRectangle(cornerRadius: 2.5).fill(f.color).frame(width: 9, height: 9)
                    Text(f.label).font(.sans(11.5)).foregroundStyle(Palette.tx2)
                }
                .opacity(present.contains(f) ? 1 : 0.35)
            }
            // Only while a striped bar is in view (#149).
            if days.contains(where: { $0.other > 0 }) {
                HStack(spacing: 5) {
                    RoundedRectangle(cornerRadius: 2.5).fill(Self.stripes(scheme)).frame(width: 9, height: 9)
                        .overlay(RoundedRectangle(cornerRadius: 2.5).strokeBorder(Palette.ac, lineWidth: 0.75))
                    Text("not in the daily average").font(.sans(11.5)).foregroundStyle(Palette.tx2)
                }
            }
        }
    }
}

/// Wraps its children onto new lines like text (the chart's legend).
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    var lineSpacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, line: CGFloat = 0, widest: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width { y += line + lineSpacing; x = 0; line = 0 }
            x += size.width + spacing
            line = max(line, size.height)
            widest = max(widest, x - spacing)
        }
        // The full width when there is one: placed in a narrower box (the widest line),
        // the items wrapped onto a line this height didn't count and ran into what's
        // below (Patrik, 3 Oct: the legend over the day panel).
        return CGSize(width: width.isFinite ? width : widest, height: y + line)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, line: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX { y += line + lineSpacing; x = bounds.minX; line = 0 }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            line = max(line, size.height)
        }
    }
}

// MARK: - where it goes

private struct WhereItGoesCard: View {
    let model: MoneyModel
    @Binding var range: Int
    @Binding var end: String?
    /// The slice under the finger (hold) or tapped; its row lights up.
    @State private var picked: Family?

    struct Group: Identifiable {
        let family: Family
        let total: Double
        /// The categories inside, biggest first: the row's second line.
        let inside: [String]
        var id: Family { family }
    }

    /// Version I of mock round 2 (Patrik, 29 Sep): the ring, its reading and every
    /// row speak in groups, so the share and the amount always match; the second
    /// line says what the group holds. A row opens those entries in All entries.
    var body: some View {
        let window = model.window(range: range, end: end)
        let cats = model.byCategory(from: window.from, to: window.to)
        let total = cats.reduce(0) { $0 + $1.total }
        let groups: [Group] = Dictionary(grouping: cats) { Categories.family($0.category) }
            .map { Group(family: $0.key, total: $0.value.reduce(0.0) { $0 + $1.total },
                         inside: $0.value.sorted { $0.total > $1.total }.map { Categories.label($0.category) }) }
            .filter { $0.total > 0 }
            .sorted { $0.total > $1.total }
        let days = Days.between(window.from, window.to) + 1
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                CardLabel("Where it goes · \(days) days", mauve: true)
                Spacer()
                Text("everyday costs").font(.sans(12.5)).foregroundStyle(Palette.tx2)
            }
            if model.unlocks.range {
                RangeBar(model: model, range: $range, end: $end)
            }
            if groups.isEmpty {
                Text("Nothing logged in these days.").font(.sans(14.5)).foregroundStyle(Palette.tx2)
                    .padding(.vertical, 8)
            } else {
                HStack(spacing: 16) {
                    ring(groups, total: total)
                    reading(total: total, days: days, groups: groups)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.vertical, 4)
                VStack(spacing: 0) {
                    ForEach(groups) { g in
                        Divider().overlay(Palette.ln)
                        row(g, total: total, window: window)
                    }
                    Divider().overlay(Palette.ln)
                    HStack {
                        Text("Everyday total").font(.sans(14.5, weight: .semibold))
                        Spacer()
                        Text(MoneyText.full(total, model.base)).font(.sans(14.5, weight: .semibold))
                    }
                    .foregroundStyle(Palette.ac2)
                    .padding(.vertical, 8)
                }
            }
        }
        .padding(16)
        .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
        .onChange(of: window.from) { picked = nil }
        .sensoryFeedback(.selection, trigger: picked)
    }

    private static func pct(_ v: Double, _ total: Double) -> Int { Int((v / max(1, total) * 100).rounded()) }

    private func ring(_ groups: [Group], total: Double) -> some View {
        Chart(groups) { g in
            SectorMark(angle: .value("Spent", g.total), innerRadius: .ratio(0.62), angularInset: 1.5)
                .foregroundStyle(g.family.color)
                .opacity(picked == nil || picked == g.family ? 1 : 0.3)
                .cornerRadius(2)
        }
        .chartLegend(.hidden)
        .frame(width: 112, height: 112)
        .overlay {
            // Hold and slide round the ring to read each group; a tap picks one and
            // a second tap lets go. Through UIKit so a swipe still scrolls the page.
            RingTouches(
                onTap: { p in
                    let g = Self.group(at: p, in: groups, total: total)
                    withAnimation(Motion.quick) { picked = (g == picked) ? nil : g }
                },
                onScrub: { p in
                    if let g = Self.group(at: p, in: groups, total: total), g != picked { picked = g }
                },
                onLift: { withAnimation(Motion.quick) { picked = nil } }
            )
        }
        .accessibilityElement()
        .accessibilityLabel(Text("Where it goes"))
        .accessibilityValue(Text(groups.map { "\($0.family.label) \(Self.pct($0.total, total))%" }.joined(separator: ", ")))
    }

    /// The group under a point of the 112-pt ring: Swift Charts starts at 12 o'clock, clockwise.
    private static func group(at p: CGPoint, in groups: [Group], total: Double) -> Family? {
        let dx = p.x - 56, dy = p.y - 56
        guard total > 0, hypot(dx, dy) > 20 else { return nil }
        var angle = atan2(dx, -dy) / (2 * .pi)
        if angle < 0 { angle += 1 }
        var sum = 0.0
        for g in groups {
            sum += g.total / total
            if angle <= sum { return g.family }
        }
        return groups.last?.family
    }

    private func reading(total: Double, days: Int, groups: [Group]) -> some View {
        let g = groups.first { $0.family == picked }
        return VStack(alignment: .leading, spacing: 2) {
            Text(g?.family.label ?? String(localized: "Everyday, \(days) days"))
                .font(.sans(13)).foregroundStyle(Palette.tx2).lineLimit(1)
            Text(MoneyText.full(g?.total ?? total, model.base))
                .font(.sans(22, weight: .semibold)).foregroundStyle(Palette.tx)
                .minimumScaleFactor(0.7).lineLimit(1)
                .contentTransition(.numericText())
            (g.map { Text("\(Self.pct($0.total, total))% of the everyday") } ?? Text("Hold the ring to read a group"))
                .font(.sans(13)).foregroundStyle(Palette.tx3)
                .fixedSize(horizontal: false, vertical: true)
        }
        .animation(Motion.quick, value: picked)
    }

    private func row(_ g: Group, total: Double, window: (from: String, to: String)) -> some View {
        NavigationLink(value: Route.moneyEntries("fam:\(g.family.rawValue):\(window.from):\(window.to)")) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                RoundedRectangle(cornerRadius: 3).fill(g.family.color).frame(width: 10, height: 10)
                    .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 4 }
                VStack(alignment: .leading, spacing: 1) {
                    Text(g.family.label).font(.sans(14.5)).foregroundStyle(Palette.tx)
                    Text(verbatim: g.inside.joined(separator: ", "))
                        .font(.sans(12.5)).foregroundStyle(Palette.tx2)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 1) {
                    Text(MoneyText.full(g.total, model.base)).font(.sans(14.5, weight: .medium)).foregroundStyle(Palette.tx)
                    Text(verbatim: "\(Self.pct(g.total, total))%").font(.sans(12.5)).foregroundStyle(Palette.tx2)
                }
                Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.tx3)
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 6)
            .background(picked == g.family ? Palette.fill : .clear, in: .rect(cornerRadius: 8))
            .padding(.horizontal, -6)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }
}

/// Tap, and hold-then-slide, on the ring with the point, and the lift that ends a hold.
private struct RingTouches: UIViewRepresentable {
    var onTap: (CGPoint) -> Void
    var onScrub: (CGPoint) -> Void
    var onLift: () -> Void

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .clear
        view.addGestureRecognizer(UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.tap(_:))))
        let hold = UILongPressGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.hold(_:)))
        hold.minimumPressDuration = 0.2
        view.addGestureRecognizer(hold)
        return view
    }

    func updateUIView(_ view: UIView, context: Context) { context.coordinator.parent = self }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    @MainActor final class Coordinator: NSObject {
        var parent: RingTouches
        init(_ parent: RingTouches) { self.parent = parent }

        @objc func tap(_ g: UITapGestureRecognizer) { parent.onTap(g.location(in: g.view)) }

        @objc func hold(_ g: UILongPressGestureRecognizer) {
            switch g.state {
            case .began, .changed: parent.onScrub(g.location(in: g.view))
            case .ended, .cancelled, .failed: parent.onLift()
            default: break
            }
        }
    }
}

// MARK: - plan

struct PlanCard: View {
    let model: MoneyModel
    @State private var open: Set<String> = []
    @State private var info = false
    @Environment(TabRouter.self) private var router

    /// Under a stop's total: what the total holds of the stay (Patrik, 27 Sep).
    static func includedWords(_ label: MoneyModel.PlanRow.StayLabel) -> String {
        switch label {
        case .paid: String(localized: "stay included")
        case .booked: String(localized: "stay included, to pay")
        case .idea: String(localized: "stay included, not booked yet")
        case .estimate: String(localized: "stay at the city average included")
        case .none: String(localized: "no stay yet")
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Button { info = true } label: {
                    HStack(spacing: 5) {
                        CardLabel("Plan · by stop", mauve: true)
                        Image(systemName: "info.circle").font(.system(size: 13)).foregroundStyle(Palette.tx3)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Plan by stop, how it is worked out")
                Spacer()
                Text(MoneyText.approx(model.projection.projected, model.base)).font(.sans(13, weight: .medium)).foregroundStyle(Palette.tx2)
            }
            .padding(.bottom, 4)
            if model.plan.isEmpty {
                Button { withAnimation(.easeInOut(duration: 0.3)) { router.select(.trip) } } label: {
                    (Text("No stops planned yet. Add them on Trip, and each one gets its cost here")
                     + Text(verbatim: " ›").foregroundColor(Palette.ac))
                        .font(.sans(14)).foregroundStyle(Palette.tx2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 10)
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
            }
            ForEach(model.plan) { row in
                Divider().overlay(Palette.ln)
                stopRow(row)
            }
            Divider().overlay(Palette.ln)
            addsUp
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
        .sheet(isPresented: $info) { PlanInfo() }
    }

    private var planGap: String? {
        guard let end = model.state.meta.endDate, let last = model.plan.map(\.seg.depart).filter({ !$0.isEmpty }).max(), last < end else { return nil }
        return String(localized: "The plan ends \(Days.short(last)); the journey ends \(Days.short(end)).")
    }

    private func toggle(_ id: String) {
        withAnimation(Motion.settle) {
            if open.contains(id) { open.remove(id) } else { open.insert(id) }
        }
    }

    private func stopRow(_ row: MoneyModel.PlanRow) -> some View {
        let isOpen = open.contains(row.id)
        // The row says the nights; the stay's state is in the breakdown (#149).
        let warn = row.stayLabel == .idea || row.stayLabel == .none
        var detail = String(localized: "\(row.nights) nights")
        if row.nightsIn > 0 { detail += " · " + String(localized: "\(row.nightsIn) in") }
        return VStack(spacing: 0) {
            Button { toggle(row.id) } label: {
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(row.seg.city).font(.sans(15, weight: .medium)).foregroundStyle(Palette.tx)
                        Text(detail).font(.sans(12.5)).foregroundStyle(Palette.tx2)
                    }
                    Spacer()
                    Text(MoneyText.approx(row.projected, model.base))
                        .font(.sans(15, weight: .semibold))
                        .foregroundStyle(warn ? Palette.warn : Palette.tx)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Palette.tx3)
                        .rotationEffect(.degrees(isOpen ? 180 : 0))
                }
                .padding(.vertical, 10)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            if isOpen {
                VStack(spacing: 0) {
                    if row.nightsIn > 0 { sum("Already spent here", row.spent) }
                    // Short labels with the currency, no repeated nights (#149).
                    if row.remaining > 0 {
                        sum(row.fromPace
                            ? Text("Your pace, \(MoneyText.full(row.rate, model.base)) a day")
                            : Text("\(tierName(row.seg)) average, \(MoneyText.full(row.rate, model.base)) a day"),
                            Double(row.remaining) * row.rate)
                    }
                    sum(Text(stayLine(row.stayLabel)), row.stay, tone: warn ? Palette.warn : nil)
                    sum("Together", row.projected, bold: true, approx: true)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(Palette.canvas, in: .rect(cornerRadius: 12))
                .padding(.bottom, 10)
                .expands()
            }
        }
    }

    /// Paid only once charged; booked before that; idea while it's only on the plan (#149).
    private func stayLine(_ label: MoneyModel.PlanRow.StayLabel) -> String {
        switch label {
        case .paid: String(localized: "Stay, paid")
        case .booked: String(localized: "Stay, booked")
        case .idea: String(localized: "Stay, idea")
        case .estimate: String(localized: "Stay, city average")
        case .none: String(localized: "No stay yet")
        }
    }

    /// The stop's comfort level, as the stop form names it.
    private func tierName(_ seg: Segment) -> String {
        switch min(2, max(0, Int(seg.tier ?? 1))) {
        case 0: String(localized: "tier.budget", defaultValue: "Budget")
        case 2: String(localized: "tier.comfort", defaultValue: "Comfort")
        default: String(localized: "tier.mid", defaultValue: "Mid")
        }
    }

    private func sum(_ title: LocalizedStringKey, _ value: Double, bold: Bool = false, approx: Bool = false) -> some View {
        sum(Text(title), value, bold: bold, approx: approx)
    }

    /// The amount stays on one line with its currency; a long label shrinks, then is cut short.
    private func sum(_ title: Text, _ value: Double, bold: Bool = false, approx: Bool = false, tone: Color? = nil) -> some View {
        HStack(spacing: 8) {
            title.font(.sans(13, weight: bold ? .semibold : .regular)).foregroundStyle(tone ?? (bold ? Palette.tx : Palette.tx2))
                .lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 8)
            Text(approx ? MoneyText.approx(value, model.base) : MoneyText.full(value, model.base))
                .font(.sans(13, weight: bold ? .semibold : .regular)).foregroundStyle(Palette.tx)
                .fixedSize()
        }
        .padding(.vertical, 6)
    }

    /// The journey's projection, part by part (spending.ts projectFromPlan).
    private var addsUp: some View {
        let p = model.projection
        let isOpen = open.contains("adds-up")
        let unbooked = model.bookings.transport.filter { $0.status == .unbooked }.count
        return VStack(spacing: 0) {
            Button { toggle("adds-up") } label: {
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("How it adds up").font(.sans(15, weight: .medium)).foregroundStyle(Palette.tx2)
                        (Text("spent, the nights ahead, what’s still to pay")
                         + (unbooked > 0 ? (Text(verbatim: " · ") + Text("\(unbooked) legs to book")).foregroundColor(Palette.warn) : Text(verbatim: "")))
                            .font(.sans(12.5)).foregroundStyle(Palette.tx2)
                    }
                    Spacer()
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Palette.tx3)
                        .rotationEffect(.degrees(isOpen ? 180 : 0))
                }
                .padding(.vertical, 10)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            if isOpen {
                if model.beforeDeparture {
                    plannedSums(p)
                } else {
                VStack(spacing: 0) {
                    sum("Spent so far", p.spent)
                    if p.scheduled > 0 { sum("Scheduled", p.scheduled) }
                    // The planned stops' nights and the days after them, one line (Patrik, 29 Sep).
                    sum("\(p.daysAhead) days ahead", p.ahead + p.unplanned, approx: p.unplanned > 0)
                    if p.unpaidStays > 0 { sum("Stays not paid yet", p.unpaidStays) }
                    if p.transportToPay > 0 { sum("Transport to pay", p.transportToPay) }
                    if p.subsAhead > 0 { sum("Subscriptions ahead", p.subsAhead) }
                    sum("The journey", p.projected, bold: true, approx: true)
                    if let gap = planGap, p.unplanned > 0 {
                        Text("\(gap) The \(p.unplannedDays) days after it count at your daily pace and the average night’s stay so far.")
                            .font(.sans(12.5)).foregroundStyle(Palette.tx2)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.vertical, 8)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(Palette.canvas, in: .rect(cornerRadius: 12))
                .padding(.bottom, 8)
                .expands()
                }
            }
        }
    }

    /// Before departure: the planned journey only, the days after it named, not priced (#149 Q6, Q9).
    private func plannedSums(_ p: MoneyModel.Projection) -> some View {
        VStack(spacing: 0) {
            sum("Spent so far", p.spent)
            if p.toPay > 0 { sum("Scheduled & to pay", p.toPay) }
            if p.ahead > 0 { sum("\(p.remainingNights) nights ahead", p.ahead, approx: true) }
            if p.staysEstimated > 0 { sum("Stays not booked yet", p.staysEstimated, approx: true) }
            if p.subsAhead > 0, let end = model.planEnd { sum("Subscriptions to \(Days.short(end))", p.subsAhead, approx: true) }
            sum("The planned journey", p.projected, bold: true, approx: true)
            if let gap = planGap, p.unplannedDays > 0 {
                Text("\(gap) The \(p.unplannedDays) days after it aren’t counted yet.")
                    .font(.sans(12.5)).foregroundStyle(Palette.tx2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.vertical, 8)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(Palette.canvas, in: .rect(cornerRadius: 12))
        .padding(.bottom, 8)
        .expands()
    }
}

private struct PlanInfo: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("How the plan is worked out").font(.serif(21)).foregroundStyle(Palette.tx)
            Text("A forecast, not a bill. For each stop: what you’ve already spent there, the nights still ahead at your daily pace, and the stay.")
            Text("Before there’s a pace, the nights use the city’s average from the catalogue. Transport still to pay and the subscriptions ahead are added once, under “How it adds up”.")
            Text("Days after the last planned stop aren’t counted yet.")
                .foregroundStyle(Palette.tx2)
            Spacer(minLength: 0)
            HStack {
                Spacer()
                Button("Got it") { dismiss() }.font(.sans(16, weight: .semibold)).foregroundStyle(Palette.ac)
            }
        }
        .font(.sans(15))
        .foregroundStyle(Palette.tx)
        .padding(22)
        .padding(.top, 8)
        .livholdSheet(detents: [.medium])
    }
}

// MARK: - bookings and subscriptions

/// Two rows and what's paid, always open (Patrik, 29 Sep: it's only two rows);
/// the total sits beside the title, as Plan's does.
private struct BookingsCard: View {
    let model: MoneyModel
    @Environment(TabRouter.self) private var router

    var body: some View {
        let b = model.bookings
        let settled = b.paid
        let due = b.scheduled + b.toPay
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                CardLabel("Bookings", mauve: true)
                Spacer()
                if !b.all.isEmpty {
                    Text(MoneyText.short(b.total, model.base)).font(.sans(13, weight: .medium)).foregroundStyle(Palette.tx2)
                }
            }
            .padding(.bottom, 4)
            if b.all.isEmpty {
                Button { withAnimation(.easeInOut(duration: 0.3)) { router.select(.trip) } } label: {
                    (Text("No stays or transport in the plan yet. They’re added on Trip")
                     + Text(verbatim: " ›").foregroundColor(Palette.ac))
                        .font(.sans(14)).foregroundStyle(Palette.tx2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 10)
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
            } else {
            VStack(spacing: 0) {
                let stays = b.stays
                let legs = b.transport
                if !stays.isEmpty {
                Divider().overlay(Palette.ln)
                // Paid once charged; a charge still ahead is booked (#149).
                let paid = stays.filter { $0.status == .paid }.count
                let booked = stays.filter { $0.status == .scheduled || $0.status == .unpaid }.count
                let unbooked = stays.filter { $0.status == .unbooked }.count
                row("stays", "Stays",
                    [paid > 0 || booked == 0 ? String(localized: "\(paid) paid") : nil,
                     booked > 0 ? String(localized: "\(booked) booked") : nil,
                     unbooked > 0 ? String(localized: "\(unbooked) not booked") : nil].compactMap { $0 }.joined(separator: " · "),
                    stays.reduce(0) { $0 + $1.amount })
                }
                if !legs.isEmpty {
                Divider().overlay(Palette.ln)
                row("transport", "Transport", String(localized: "\(legs.filter { $0.status != .unbooked }.count) of \(legs.count) booked"),
                    legs.reduce(0) { $0 + $1.amount })
                }
                Divider().overlay(Palette.ln)
                VStack(spacing: 4) {
                    if settled > 0 { sumLine("Paid", settled, Palette.tx2) }
                    if due > 0 { sumLine("Scheduled & to pay", due, Palette.tx2) }
                    if b.notBooked > 0 { sumLine("Not booked yet", b.notBooked, Palette.warn) }
                }
                .padding(.top, 10)
            }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
    }

    /// Stays and transport are booked and changed on the Trip page, so a row
    /// goes there (the web's Bookings card links to /itinerary the same way).
    private func row(_ cat: String, _ title: LocalizedStringKey, _ detail: String, _ amount: Double) -> some View {
        Button { withAnimation(.easeInOut(duration: 0.3)) { router.select(.trip) } } label: {
            HStack(spacing: 12) {
                CategoryTile(id: cat, size: 30)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.sans(15, weight: .medium)).foregroundStyle(Palette.tx)
                    Text(detail).font(.sans(12.5)).foregroundStyle(Palette.tx2)
                }
                Spacer()
                Text(MoneyText.short(amount, model.base)).font(.sans(15, weight: .semibold)).foregroundStyle(Palette.tx)
                Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.tx3)
            }
            .padding(.vertical, 9)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityHint("Opens the Trip page")
    }

    private func sumLine(_ title: LocalizedStringKey,_ v: Double, _ tone: Color) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text(MoneyText.full(v, model.base))
        }
        .font(.sans(13.5))
        .foregroundStyle(tone)
    }
}

/// Latest's pattern (Patrik, 29 Sep): the three that charge next, the rest on
/// Subscriptions, one tap away; always open, like every card on Money now.
private struct SubscriptionsCard: View {
    let model: MoneyModel
    @Environment(\.tabZoom) private var zoom

    var body: some View {
        let active = SubscriptionList.active(model)
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                CardLabel("Subscriptions", mauve: true)
                Spacer()
                if !model.subscriptions.isEmpty {
                    NavigationLink(value: Route.moneySubscriptions) {
                        Text("All subscriptions").font(.sans(13.5, weight: .medium)).foregroundStyle(Palette.ac)
                        + Text(verbatim: " ›").font(.sans(13.5, weight: .medium)).foregroundStyle(Palette.ac)
                    }
                }
            }
            .padding(.bottom, 4)
            if model.subscriptions.isEmpty {
                SubscriptionsEmpty()
            } else if active.isEmpty {
                Text("None active. The cancelled ones are under All subscriptions.")
                    .font(.sans(14)).foregroundStyle(Palette.tx2)
                    .padding(.vertical, 10)
            } else {
                ForEach(active.prefix(3)) { sub in
                    Divider().overlay(Palette.ln)
                    SubscriptionRow(sub: sub, model: model)
                }
                Divider().overlay(Palette.ln)
                HStack {
                    Text("\(active.count) active")
                    Spacer()
                    Text("\(MoneyText.approx(SubscriptionList.monthly(active, model), model.base)) a month")
                }
                .font(.sans(13.5)).foregroundStyle(Palette.tx2)
                .padding(.top, 10)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
        .modifier(ZoomSource(id: "subscriptions", namespace: zoom))
    }
}

// MARK: - tracking off

private struct InviteCard: View {
    @Environment(TripStore.self) private var store
    @Environment(MoneyEditor.self) private var editor
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("See what a day costs").font(.serif(19)).foregroundStyle(Palette.tx)
            Text("Log what you spend as you go, and Money adds your daily pace, where it goes, and where the journey lands.")
                .font(.sans(14)).foregroundStyle(Palette.tx2)
            Button("Track spending") {
                Task {
                    do { try await store.setTracking(true) } catch { self.error = error.localizedDescription }
                }
            }
            .buttonStyle(.primary)
            .padding(.top, 4)
            if store.canEdit {
                Button("or add a first expense") { editor.target = .add(.expense) }
                    .font(.sans(13.5)).foregroundStyle(Palette.ac)
                    .frame(maxWidth: .infinity)
            }
            if let error { Notice(verbatim: error, kind: .warn) }
        }
        .padding(16)
        .background(Palette.acSoft.opacity(0.5), in: .rect(cornerRadius: Radius.r))
        .overlay(RoundedRectangle(cornerRadius: Radius.r).strokeBorder(Palette.acLine, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
    }
}

/// Asked once per person; the same answer the web stores (profiles.track_spending).
private struct TrackQuestion: View {
    var onClose: () -> Void
    @Environment(TripStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Track what you spend on this journey?").font(.serif(23)).foregroundStyle(Palette.tx)
            Text("Log what you spend as you go. Money works out what a day costs and where the journey lands against your budget.")
                .font(.sans(15)).foregroundStyle(Palette.tx2)
            VStack(spacing: 0) {
                row("A daily pace", "after 3 days")
                Divider().overlay(Palette.ln)
                row("Where the journey lands", "after a week")
            }
            .padding(.horizontal, 14)
            .background(Palette.canvas, in: .rect(cornerRadius: 14))
            if let error { Notice(verbatim: error, kind: .warn) }
            Button("Yes, track it") { answer(true) }.buttonStyle(.primary)
            Button("Not now") { answer(false) }
                .font(.sans(16, weight: .medium)).foregroundStyle(Palette.ac)
                .frame(maxWidth: .infinity)
            Text("Asked once. Change it any time in Settings → Money.")
                .font(.sans(12.5)).foregroundStyle(Palette.tx3)
                .frame(maxWidth: .infinity)
        }
        .padding(22)
        .padding(.top, 6)
        .livholdSheet(detents: [.medium, .large])
    }

    private func row(_ a: LocalizedStringKey, _ b: LocalizedStringKey) -> some View {
        HStack {
            Text(a).font(.sans(14.5)).foregroundStyle(Palette.tx)
            Spacer()
            Text(b).font(.sans(13.5)).foregroundStyle(Palette.tx3)
        }
        .padding(.vertical, 11)
    }

    private func answer(_ on: Bool) {
        Task {
            do {
                try await store.setTracking(on)
                onClose()
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

/// Diagonal lines on a pale ground of the same colour: what's outside the daily
/// average on the chart, the days after the plan on the ring.
enum Stripes {
    static func paint(_ color: Color, _ scheme: ColorScheme) -> ImagePaint {
        let ink = UIColor(color).resolvedColor(with: UITraitCollection(userInterfaceStyle: scheme == .dark ? .dark : .light))
        let image = UIGraphicsImageRenderer(size: CGSize(width: 6, height: 6)).image { ctx in
            ink.withAlphaComponent(0.18).setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 6, height: 6))
            ink.setStroke()
            let path = UIBezierPath()
            path.lineWidth = 1.6
            for o in stride(from: -6.0, through: 6.0, by: 6.0) {
                path.move(to: CGPoint(x: o, y: 6))
                path.addLine(to: CGPoint(x: o + 6, y: 0))
            }
            path.stroke()
        }
        return ImagePaint(image: Image(uiImage: image))
    }
}

/// The budget as a ring (Patrik, 27 Sep; parts on it, 4 Oct): each part an arc
/// in row order, the full circle the budget. Past the budget the parts stop at
/// full and the rest runs on as an amber lap outside, the centre saying by how
/// much. With no budget the circle is the whole and the centre says what's spent.
struct BudgetRing: View {
    struct Arc { let value: Double; let color: Color; var hatched = false }
    let arcs: [Arc]
    let budget: Double?
    let spent: Double
    @Environment(\.colorScheme) private var scheme

    private static let width: CGFloat = 10

    var body: some View {
        let total = arcs.reduce(0) { $0 + $1.value }
        let whole = max(budget ?? total, 1)
        let over = budget.map { total - $0 } ?? 0
        let gap = arcs.count > 1 ? 0.006 : 0
        ZStack {
            Circle().stroke(Palette.tr, lineWidth: Self.width)
            ForEach(arcs.indices, id: \.self) { i in
                let start = arcs[..<i].reduce(0) { $0 + $1.value } / whole
                let end = min(1, start + arcs[i].value / whole)
                if end - gap > start {
                    Circle().trim(from: start, to: end - gap)
                        .stroke(arcs[i].hatched ? AnyShapeStyle(Stripes.paint(arcs[i].color, scheme)) : AnyShapeStyle(arcs[i].color),
                                lineWidth: Self.width)
                        .rotationEffect(.degrees(-90))
                }
            }
            if over > 0, let budget {
                Circle().trim(from: 0, to: min(1, over / budget))
                    .stroke(Palette.warn, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .padding(-11)
            }
            VStack(spacing: 0) {
                if over > 0 {
                    Text(verbatim: "+" + MoneyText.compact(over))
                        .font(.sans(17, weight: .semibold)).foregroundStyle(Palette.warn)
                    Text("over budget").font(.sans(10.5)).foregroundStyle(Palette.tx2)
                } else if budget != nil {
                    Text(verbatim: "\(Int((total / whole * 100).rounded()))%")
                        .font(.sans(19, weight: .semibold)).foregroundStyle(Palette.tx)
                    Text("of budget").font(.sans(10.5)).foregroundStyle(Palette.tx2)
                } else {
                    Text(verbatim: "\(Int((spent / whole * 100).rounded()))%")
                        .font(.sans(19, weight: .semibold)).foregroundStyle(Palette.tx)
                    Text("spent").font(.sans(10.5)).foregroundStyle(Palette.tx2)
                }
            }
            .contentTransition(.numericText())
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .padding(.horizontal, Self.width + 2)
        }
        .frame(width: 96, height: 96)
        .padding(13)
        .animation(Motion.settle, value: total)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibility(total: total, over: over))
    }

    private func accessibility(total: Double, over: Double) -> String {
        guard let budget else { return String(localized: "\(Int((spent / max(total, 1) * 100).rounded()))% spent") }
        if over > 0 { return String(localized: "\(MoneyText.compact(over)) over budget") }
        return String(localized: "\(Int((total / budget * 100).rounded()))% of budget")
    }
}
