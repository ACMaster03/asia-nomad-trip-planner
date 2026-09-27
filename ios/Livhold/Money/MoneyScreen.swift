import Charts
import SwiftUI

// Money on iOS (Money mock round 2, approved by Patrik on 27 Sep with the gaps
// left as issues): the top card, Latest, Daily spend and Where it goes as the
// web has them, Plan by stop with its sums, then Bookings and Subscriptions
// folded. Tracking lives in Settings → Money; with it off the page shows what's
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
                Text("Start a journey on livhold.com — its money shows up here.")
                    .font(.sans(16)).foregroundStyle(Palette.tx2)
            }
            .padding(.top, 40)
        case .failed:
            VStack(alignment: .leading, spacing: 14) {
                Text("Money").font(.serif(28)).foregroundStyle(Palette.tx)
                Notice(text: store.error ?? "Couldn’t load your journey.", kind: .warn)
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

    /// The quiet page: tracking off, or not answered and nothing typed yet (tracking.ts isQuiet).
    private var quiet: Bool {
        store.tracking == .no || (store.tracking == .ask && !model.ledger.contains { $0.source == nil })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            if quiet {
                BookingsCard(model: model, open: true)
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
                LatestCard(model: model)
                if model.unlocks.chart {
                    DailySpendCard(model: model)
                }
                if model.unlocks.whereItGoes {
                    WhereItGoesCard(model: model)
                }
                if model.unlocks.projection {
                    PlanCard(model: model)
                }
                if !model.unlocks.chart || !model.unlocks.projection {
                    Text("More appears as you log: a chart after 3 days, a projection after a week.")
                        .font(.sans(13)).foregroundStyle(Palette.tx3)
                        .padding(.horizontal, 4)
                }
                BookingsCard(model: model, open: false)
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
                     : "\(model.state.meta.tripName ?? "Journey") · \(Journey.kicker(model.state, today: model.today).lowercasedFirst)")
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
    let text: String
    var mauve = false

    init(_ text: String, mauve: Bool = false) {
        self.text = text
        self.mauve = mauve
    }

    var body: some View {
        Text(text)
            .font(.sans(11.5, weight: .semibold, relativeTo: .caption))
            .textCase(.uppercase)
            .tracking(1.3)
            .foregroundStyle(mauve ? Palette.ac2 : Palette.tx3)
    }
}

/// A plain row that reads like a list row on a card.
private struct Line<Trailing: View>: View {
    let title: String
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

/// Today, this stop or the whole journey (Patrik, 27 Sep, #114: a switch to try
/// on the phone before the web picks one). Journey is mock version A.
private struct TopCard: View {
    let model: MoneyModel

    /// The stop and the whole journey; Today went on 27 Sep (Patrik).
    enum View: String, CaseIterable, Identifiable { case here = "Here", journey = "Journey"; var id: Self { self } }
    @AppStorage("money.topView") private var view: View = .journey
    @Environment(TabRouter.self) private var router

    var body: some SwiftUI.View {
        VStack(alignment: .leading, spacing: 12) {
            Picker("Show", selection: $view.animation(Motion.settle)) {
                ForEach(View.allCases) { Text(title($0)).tag($0) }
            }
            .pickerStyle(.segmented)
            Group {
                switch view {
                case .here: here
                case .journey: journey
                }
            }
            .transition(.opacity)
        }
        .padding(16)
        .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
        .sensoryFeedback(.selection, trigger: view)
    }

    /// The middle tab is the stop's city (Patrik, 27 Sep); a name too long for a
    /// third of the control, or no stop today, reads "This stop".
    private func title(_ v: View) -> String {
        guard v == .here else { return v.rawValue }
        guard let city = model.currentPlan?.seg.city, city.count <= 12 else { return "This stop" }
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

    private func tile(_ label: String, _ value: String, _ detail: String?, tone: Color = Palette.tx2) -> some SwiftUI.View {
        VStack(alignment: .leading, spacing: 2) {
            CardLabel(label)
            Text(value).font(.sans(19, weight: .semibold)).foregroundStyle(Palette.tx)
                .contentTransition(.numericText()).lineLimit(1).minimumScaleFactor(0.8)
            if let detail { Text(detail).font(.sans(12.5)).foregroundStyle(tone).fixedSize(horizontal: false, vertical: true) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: journey

    private var journey: some SwiftUI.View {
        let p = model.projection
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    CardLabel(spentLabel)
                    big(MoneyText.short(p.spent, model.base), value: p.spent)
                    if p.scheduled > 0 {
                        Text("+ \(MoneyText.approx(p.scheduled, model.base)) scheduled, not spent yet")
                            .font(.sans(13)).foregroundStyle(Palette.tx2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                ring(p)
            }
            HStack(alignment: .top, spacing: 12) {
                paceTile
                if model.unlocks.projection {
                    tile("Lands near", MoneyText.approx(p.projected, model.base), capLine(p.projected), tone: over(p.projected) ? Palette.warn : Palette.tx2)
                }
            }
            if model.unlocks.projection, let lessLine = lessPerDay(p) {
                Text(lessLine).font(.sans(13)).foregroundStyle(Palette.warn)
            }
            if model.unlocks.beyond, model.beyondTotal > 0 {
                Divider().overlay(Palette.ln)
                NavigationLink(value: Route.moneyEntries("beyond")) {
                    HStack {
                        Text("+ \(MoneyText.short(model.beyondTotal, model.base)) beyond the everyday")
                            .font(.sans(13.5)).foregroundStyle(Palette.tx2)
                        Spacer()
                        Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.tx3)
                    }
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
            }
        }
    }

    /// The cap as a ring (Patrik, 27 Sep, instead of a bar with no words): the
    /// solid arc is spent, the pale one where the journey lands, the full circle
    /// the cap; the middle says how much is spent. With no cap it measures the
    /// spend against where the journey lands. A tap opens the cap in Settings → Money.
    @ViewBuilder private func ring(_ p: MoneyModel.Projection) -> some SwiftUI.View {
        let projected = model.unlocks.projection ? p.projected : nil
        if let whole = model.cap ?? projected, whole > 0 {
            let isOver = (projected ?? p.spent) > whole
            let tint = isOver ? Palette.warn : Palette.ac
            Button { router.paths[.money, default: []].append(.moneySettings) } label: {
                VStack(spacing: 5) {
                    ZStack {
                        Circle().stroke(Palette.tr, lineWidth: 9)
                        if let projected, model.cap != nil {
                            Circle().trim(from: 0, to: min(1, projected / whole))
                                .stroke(tint.opacity(0.3), style: StrokeStyle(lineWidth: 9, lineCap: .round))
                                .rotationEffect(.degrees(-90))
                        }
                        Circle().trim(from: 0, to: min(1, p.spent / whole))
                            .stroke(tint, style: StrokeStyle(lineWidth: 9, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                        VStack(spacing: 0) {
                            Text("\(Int((p.spent / whole * 100).rounded()))%")
                                .font(.sans(19, weight: .semibold)).foregroundStyle(Palette.tx)
                                .contentTransition(.numericText())
                            Text("spent").font(.sans(11)).foregroundStyle(Palette.tx2)
                        }
                    }
                    .frame(width: 88, height: 88)
                    .animation(Motion.settle, value: p.spent)
                    Text(model.cap != nil ? "of your cap" : "of where it lands")
                        .font(.sans(11.5)).foregroundStyle(Palette.tx2)
                        .fixedSize()
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(model.cap.map { "Budget cap \(MoneyText.full($0, model.base)), \(Int((p.spent / $0 * 100).rounded()))% spent" }
                                ?? "\(Int((p.spent / whole * 100).rounded()))% of where the journey lands")
            .accessibilityHint("Opens Money settings")
        }
    }

    private var spentLabel: String {
        if let day = model.tripDay { return "Spent so far · \(day) day\(day == 1 ? "" : "s")" }
        return model.tripStart != nil ? "Spent so far · before departure" : "Spent so far"
    }

    @ViewBuilder private var paceTile: some SwiftUI.View {
        if let perDay = model.pace.perDay {
            let whereText: String = model.pace.scope == .stop ? "in \(model.current?.city ?? "this stop")" : "since departure"
            tile("Per day", MoneyText.full(perDay, model.base), "everyday, \(whereText)")
        } else if let day = model.tripDay {
            tile("Per day", "measuring…", "\(min(day, 3)) of 3 days")
        } else {
            tile("Per day", "measuring…", "starts on departure day")
        }
    }

    private func over(_ projected: Double) -> Bool { model.cap.map { projected > $0 } ?? false }

    private func capLine(_ projected: Double) -> String? {
        guard let cap = model.cap else {
            return "\(model.plan.reduce(0) { $0 + $1.nights }) planned nights"
        }
        if projected > cap { return "about \(MoneyText.approx(projected - cap, model.base).dropFirst(2)) over your cap" }
        return "\(Int((projected / cap * 100).rounded()))% of your cap"
    }

    /// Over the cap: what a day would need to cost less, amber, never red (Patrik, 27 Sep).
    private func lessPerDay(_ p: MoneyModel.Projection) -> String? {
        guard let cap = model.cap, p.projected > cap, p.remainingNights > 0 else { return nil }
        let less = (p.projected - cap) / Double(p.remainingNights)
        return "About \(MoneyText.full((less / 50).rounded(.up) * 50, model.base)) a day less gets you there."
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
                    tile("Per day here", MoneyText.full(local.perDay, model.base), "over \(local.days) day\(local.days == 1 ? "" : "s")")
                    tile("The stop comes to", MoneyText.approx(row.projected, model.base), PlanCard.includedWords(row.stayLabel),
                         tone: row.stayLabel == .draft || row.stayLabel == .none ? Palette.warn : Palette.tx2)
                }
                StopBar(row: row)
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
                Text(row.remaining > 0
                     ? "\(row.remaining) night\(row.remaining == 1 ? "" : "s") left · out \(Days.short(row.seg.depart))"
                     : "last night · out \(Days.short(row.seg.depart))")
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
                    + Text(" ›").font(.sans(13.5, weight: .medium)).foregroundStyle(Palette.ac)
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
                Text(detail).font(.sans(12.5)).foregroundStyle(entry.orphaned ? Palette.warn : Palette.tx2).lineLimit(1)
            }
            Spacer(minLength: 8)
            Text((entry.type == .income ? "+" : "") + MoneyText.full(base, model.base))
                .font(.sans(15, weight: .semibold))
                .foregroundStyle(entry.type == .income ? Palette.ac : Palette.tx)
        }
        .padding(.vertical, 9)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
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

    private var detail: String {
        var parts = [Categories.label(entry.category)]
        if dateStyle == .relative { parts.append(MoneyText.day(entry.date, today: model.today)) }
        if entry.currency != model.base, !entry.currency.isEmpty { parts.append(MoneyText.original(entry)) }
        if entry.orphaned { parts.append("booking removed") }
        else if entry.source?.kind == "sub" { parts.append("added by itself") }
        else if entry.isImported { parts.append("from booking") }
        else if hollow { parts.append("not in daily average") }
        else if entry.source == nil, entry.isExpense, !Categories.isEveryday(entry.category), isEverydayRow(entry) { parts.append("in daily average") }
        return parts.joined(separator: " · ")
    }
}

// MARK: - daily spend

private struct DailySpendCard: View {
    let model: MoneyModel
    @State private var range = 14
    @State private var end: String?
    @State private var selected: String?

    var body: some View {
        let window = model.window(range: range, end: end)
        let days = model.daily(from: window.from, to: window.to)
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
                HStack(spacing: 6) {
                    pager("chevron.left", enabled: window.from > model.earliestDate) { page(-1, window) }
                    Picker("Days", selection: $range) {
                        ForEach([7, 14, 30, 90], id: \.self) { Text("\($0)d").tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: range) { end = nil; selected = nil }
                    pager("chevron.right", enabled: window.to < model.today) { page(1, window) }
                }
            }
            // Days on a real date axis: one bar per calendar day, labels only where
            // `labels` puts them. (A text axis labelled every day on some phones.)
            Chart {
                ForEach(days) { day in
                    let x = Self.day(day.date)
                    if day.total == 0 {
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
            // and the callout follows the finger day by day, with a tick on each
            // (Patrik, 27 Sep). The hold keeps a plain swipe for the page's scrolling.
            .chartOverlay { proxy in
                GeometryReader { geo in
                    let dayAt = { (x: CGFloat) -> String? in
                        guard let plot = proxy.plotFrame,
                              let date: Date = proxy.value(atX: x - geo[plot].origin.x) else { return nil }
                        return min(max(EntrySheet.iso(date), window.from), window.to)
                    }
                    Rectangle().fill(.clear).contentShape(.rect)
                        .gesture(
                            LongPressGesture(minimumDuration: 0.2)
                                .sequenced(before: DragGesture(minimumDistance: 0))
                                .onChanged { value in
                                    guard case .second(true, let drag?) = value,
                                          let day = dayAt(drag.location.x), day != selected else { return }
                                    selected = day
                                }
                                .exclusively(before: SpatialTapGesture().onEnded { tap in
                                    guard let day = dayAt(tap.location.x) else { return }
                                    withAnimation(Motion.quick) { selected = selected == day ? nil : day }
                                })
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
                            Text(d == model.today ? "today" : axisLabel(d))
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

            if let selected { callout(selected) }

            legend(days)
        }
        .padding(16)
        .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
    }

    /// A ledger day as the start of that day on the phone's calendar, which is
    /// what the chart's day bins use.
    static func day(_ iso: String) -> Date {
        let p = iso.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return .now }
        return Calendar.current.date(from: DateComponents(year: p[0], month: p[1], day: p[2])) ?? .now
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
        withAnimation(Motion.settle) {
            end = next >= model.today ? nil : next
            selected = nil
        }
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
            let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
            return months[(Int(d.dropFirst(5).prefix(2)) ?? 1) - 1]
        }
        return Days.short(d)
    }

    private func callout(_ date: String) -> some View {
        let entries = model.entries(on: date)
        let total = entries.reduce(0) { $0 + Journey.toBase($1.amount, $1.currency, model.rates) }
        // The day's things as a list, full amounts (Patrik, 27 Sep: "6081 · 895" in one
        // line saved room but didn't read). The five largest; the rest are one tap away.
        let shown = entries.prefix(5)
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
                    Text(entries.count > shown.count ? "\(entries.count - shown.count) more in All entries ›" : "Open in All entries ›")
                        .font(.sans(13.5, weight: .medium)).foregroundStyle(Palette.ac)
                }
                .padding(.top, 2)
            }
        }
        .padding(10)
        .background(Palette.canvas, in: .rect(cornerRadius: 12))
        .transition(.opacity)
    }

    private func legend(_ days: [MoneyModel.Day]) -> some View {
        let shown = Family.allCases.filter { f in days.contains { ($0.byFamily[f] ?? 0) > 0 } }
        return FlowLayout(spacing: 12, lineSpacing: 4) {
            ForEach(shown) { f in
                HStack(spacing: 5) {
                    RoundedRectangle(cornerRadius: 2.5).fill(f.color).frame(width: 9, height: 9)
                    Text(f.label).font(.sans(11.5)).foregroundStyle(Palette.tx2)
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
        return CGSize(width: min(widest, width), height: y + line)
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
    @State private var showAll = false

    var body: some View {
        let window = model.window(range: 14, end: nil)
        let cats = model.byCategory(from: window.from, to: window.to)
        let total = cats.reduce(0) { $0 + $1.total }
        let families = Dictionary(grouping: cats) { Categories.family($0.category) }
            .map { (family: $0.key, total: $0.value.reduce(0) { $0 + $1.total }) }
            .filter { $0.total > 0 }
            .sorted { $0.total > $1.total }
        let days = Days.between(window.from, window.to) + 1
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                CardLabel("Where it goes · \(days) days", mauve: true)
                Spacer()
                Text("everyday costs").font(.sans(12.5)).foregroundStyle(Palette.tx2)
            }
            HStack(spacing: 16) {
                Chart(families, id: \.family) { f in
                    SectorMark(angle: .value("Spent", f.total), innerRadius: .ratio(0.64), angularInset: 1.5)
                        .foregroundStyle(f.family.color)
                        .cornerRadius(2)
                }
                .chartBackground { _ in
                    VStack(spacing: 0) {
                        Text(MoneyText.number(total, model.base)).font(.sans(15, weight: .semibold)).foregroundStyle(Palette.tx)
                            .minimumScaleFactor(0.7).lineLimit(1)
                        Text("in \(days) days").font(.sans(10.5)).foregroundStyle(Palette.tx3)
                    }
                    .padding(.horizontal, 24)
                }
                .frame(width: 112, height: 112)
                sentence(families, total: total)
                    .font(.sans(14.5))
                    .foregroundStyle(Palette.tx)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, 4)
            VStack(spacing: 0) {
                // "1 more…" hides as much as it saves: fold only two or more.
                let folds = cats.count > 9 && !showAll
                let shown = folds ? Array(cats.prefix(8)) : cats
                ForEach(shown) { c in
                    Divider().overlay(Palette.ln)
                    NavigationLink(value: Route.moneyEntries("cat:\(c.category)")) {
                        HStack(spacing: 10) {
                            RoundedRectangle(cornerRadius: 3).fill(Categories.color(c.category)).frame(width: 10, height: 10)
                            Text(Categories.label(c.category)).font(.sans(14.5)).foregroundStyle(Palette.tx)
                            Spacer()
                            Text(MoneyText.full(c.total, model.base)).font(.sans(14.5, weight: .medium)).foregroundStyle(Palette.tx)
                            Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.tx3)
                        }
                        .padding(.vertical, 8)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                }
                if folds {
                    let rest = cats.dropFirst(8).reduce(0) { $0 + $1.total }
                    Divider().overlay(Palette.ln)
                    Button { withAnimation(Motion.settle) { showAll = true } } label: {
                        HStack {
                            Text("\(cats.count - 8) more…").font(.sans(14.5)).foregroundStyle(Palette.tx2)
                            Spacer()
                            Text(MoneyText.full(rest, model.base)).font(.sans(14.5)).foregroundStyle(Palette.tx2)
                        }
                        .padding(.vertical, 8)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
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
        .padding(16)
        .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
    }

    /// "Food & drinks take 41%. Getting around 18%, health & care 16%." (WhereItGoes.tsx)
    private func sentence(_ f: [(family: Family, total: Double)], total: Double) -> Text {
        func pct(_ v: Double) -> Int { Int((v / max(1, total) * 100).rounded()) }
        guard let first = f.first else { return Text("Nothing logged in these days.") }
        var t = Text(first.family.label).bold() + Text(" take \(pct(first.total))%.")
        if f.count > 1 {
            t = t + Text(" ") + Text(f[1].family.label).bold() + Text(" \(pct(f[1].total))%")
            if f.count > 2 { t = t + Text(", \(f[2].family.label.lowercased()) \(pct(f[2].total))%") }
            t = t + Text(".")
        }
        return t
    }
}

// MARK: - plan

struct PlanCard: View {
    let model: MoneyModel
    @State private var open: Set<String> = []
    @State private var info = false
    @Environment(TabRouter.self) private var router

    static func stayWords(_ label: MoneyModel.PlanRow.StayLabel) -> String {
        switch label {
        case .booked: "stay paid"
        case .unpaid: "stay booked, to pay"
        case .draft: "stay not booked"
        case .estimate: "stay estimated"
        case .none: "no stay yet"
        }
    }

    /// Under a stop's total: what the total holds of the stay (Patrik, 27 Sep).
    static func includedWords(_ label: MoneyModel.PlanRow.StayLabel) -> String {
        switch label {
        case .booked: "stay included"
        case .unpaid: "stay included, to pay"
        case .draft: "stay included, not booked yet"
        case .estimate: "stay at the city average included"
        case .none: "no stay yet"
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
            ForEach(model.plan) { row in
                Divider().overlay(Palette.ln)
                stopRow(row)
            }
            if let gap = planGap {
                Divider().overlay(Palette.ln)
                Button { router.selection = .trip } label: {
                    Line(title: "Add the next stop", detail: gap) {
                        Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.tx3)
                    }
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
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
        return "The plan ends \(Days.short(last)); the journey ends \(Days.short(end))."
    }

    private func toggle(_ id: String) {
        withAnimation(Motion.settle) {
            if open.contains(id) { open.remove(id) } else { open.insert(id) }
        }
    }

    private func stopRow(_ row: MoneyModel.PlanRow) -> some View {
        let isOpen = open.contains(row.id)
        let warn = row.stayLabel == .draft || row.stayLabel == .none
        var detail = "\(row.nights) night\(row.nights == 1 ? "" : "s")"
        if row.nightsIn > 0 { detail += " · \(row.nightsIn) in" }
        return VStack(spacing: 0) {
            Button { toggle(row.id) } label: {
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(row.seg.city).font(.sans(15, weight: .medium)).foregroundStyle(Palette.tx)
                        (Text(detail + " · ") + Text(Self.stayWords(row.stayLabel)).foregroundColor(warn ? Palette.warn : Palette.tx2))
                            .font(.sans(12.5)).foregroundStyle(Palette.tx2)
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
                    sum("\(row.remaining) night\(row.remaining == 1 ? "" : "s") left × \(MoneyText.number(row.rate, model.base))"
                        + (row.fromPace ? "" : " (city average)"), Double(row.remaining) * row.rate)
                    sum(stayLine(row.stayLabel), row.stay)
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

    private func stayLine(_ label: MoneyModel.PlanRow.StayLabel) -> String {
        switch label {
        case .booked: "The stay, paid"
        case .unpaid: "The stay, to pay"
        case .draft: "The stay, not booked yet"
        case .estimate: "A stay, at the city average"
        case .none: "No stay yet"
        }
    }

    private func sum(_ title: String, _ value: Double, bold: Bool = false, approx: Bool = false) -> some View {
        HStack {
            Text(title).font(.sans(13, weight: bold ? .semibold : .regular)).foregroundStyle(bold ? Palette.tx : Palette.tx2)
            Spacer()
            Text(approx ? MoneyText.approx(value, model.base) : MoneyText.full(value, model.base))
                .font(.sans(13, weight: bold ? .semibold : .regular)).foregroundStyle(Palette.tx)
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
                         + (unbooked > 0 ? Text(" · \(unbooked) leg\(unbooked == 1 ? "" : "s") to book").foregroundColor(Palette.warn) : Text("")))
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
                VStack(spacing: 0) {
                    sum("Spent so far", p.spent)
                    if p.scheduled > 0 { sum("Scheduled, not spent yet", p.scheduled) }
                    sum("\(p.remainingNights) nights ahead", p.ahead)
                    if p.unpaidStays > 0 { sum("Stays not paid yet", p.unpaidStays) }
                    if p.transportToPay > 0 { sum("Transport to pay", p.transportToPay) }
                    if p.subsAhead > 0 { sum("Subscriptions ahead", p.subsAhead) }
                    sum("The journey", p.projected, bold: true, approx: true)
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

private struct Fold<Content: View>: View {
    let title: String
    let summary: Text
    @State var open: Bool
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { withAnimation(Motion.settle) { open.toggle() } } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        CardLabel(title)
                        summary.font(.sans(13.5)).foregroundStyle(Palette.tx2)
                    }
                    Spacer()
                    Image(systemName: "chevron.down")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Palette.tx3)
                        .rotationEffect(.degrees(open ? 180 : 0))
                }
                .padding(.vertical, 12)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            if open {
                content
                    .padding(.bottom, 10)
                    .expands()
            }
        }
        .padding(.horizontal, 16)
        .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
        .clipped()
    }
}

private struct BookingsCard: View {
    let model: MoneyModel
    let open: Bool
    @Environment(TabRouter.self) private var router

    var body: some View {
        let b = model.bookings
        let scheduled = b.scheduled(after: model.today)
        let settled = b.paid(before: model.today)
        let due = scheduled + b.toPay
        let total = MoneyText.short(b.total, model.base)
        let summary: Text = b.notBooked > 0
            ? Text("\(total) · ") + Text("\(MoneyText.approx(b.notBooked, model.base)) not booked yet").foregroundColor(Palette.warn)
            : (due > 0 ? Text("\(total) · \(MoneyText.approx(due, model.base)) to pay") : Text("\(total), all paid"))
        Fold(title: "Bookings", summary: summary, open: open) {
            VStack(spacing: 0) {
                let stays = b.stays
                let legs = b.transport
                Divider().overlay(Palette.ln)
                row("stays", "Stays",
                    "\(stays.filter { $0.status == .paid }.count) paid" + (stays.contains { $0.status == .unbooked } ? " · \(stays.filter { $0.status == .unbooked }.count) not booked" : ""),
                    stays.reduce(0) { $0 + $1.amount })
                Divider().overlay(Palette.ln)
                row("transport", "Transport", "\(legs.filter { $0.status != .unbooked }.count) of \(legs.count) booked",
                    legs.reduce(0) { $0 + $1.amount })
                Divider().overlay(Palette.ln)
                VStack(spacing: 4) {
                    sumLine("Paid", settled, Palette.tx2)
                    if due > 0 { sumLine("Scheduled & to pay", due, Palette.tx2) }
                    if b.notBooked > 0 { sumLine("Not booked yet", b.notBooked, Palette.warn) }
                }
                .padding(.top, 10)
            }
        }
    }

    /// Stays and transport are booked and changed on the Trip page, so a row
    /// goes there (the web's Bookings card links to /itinerary the same way).
    private func row(_ cat: String, _ title: String, _ detail: String, _ amount: Double) -> some View {
        Button { router.select(.trip) } label: {
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

    private func sumLine(_ title: String, _ v: Double, _ tone: Color) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text(MoneyText.full(v, model.base))
        }
        .font(.sans(13.5))
        .foregroundStyle(tone)
    }
}

private struct SubscriptionsCard: View {
    let model: MoneyModel
    @Environment(TripStore.self) private var store
    @Environment(MoneyEditor.self) private var editor
    @State private var showCancelled = false

    var body: some View {
        let active = model.subscriptions.filter { !$0.isCancelled }
        let cancelled = model.subscriptions.filter(\.isCancelled)
        let monthly = active.reduce(0) { $0 + Journey.toBase($1.amount, $1.cur, model.rates) / Double($1.everyMonths) }
        if model.subscriptions.isEmpty {
            // Nothing yet: what they are, and the way to add one.
            VStack(alignment: .leading, spacing: 8) {
                CardLabel("Subscriptions", mauve: true)
                Text(store.canEdit ? "Repeating costs, like Netflix or iCloud." : "Nothing recurring recorded yet.")
                    .font(.sans(14.5)).foregroundStyle(Palette.tx2)
                if store.canEdit { addButton }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
        } else {
            Fold(title: "Subscriptions", summary: summary(active, monthly), open: false) {
                VStack(spacing: 0) {
                    ForEach(active) { row($0) }
                    if showCancelled { ForEach(cancelled) { row($0) } }
                    if !cancelled.isEmpty {
                        Divider().overlay(Palette.ln)
                        Button(showCancelled ? "Hide cancelled" : "Show cancelled (\(cancelled.count))") {
                            withAnimation(Motion.settle) { showCancelled.toggle() }
                        }
                        .font(.sans(13.5, weight: .semibold)).foregroundStyle(Palette.ac)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 10)
                    }
                    Divider().overlay(Palette.ln)
                    VStack(spacing: 4) {
                        HStack {
                            Text("\(active.count) active").foregroundStyle(Palette.tx2)
                            Spacer()
                            Text("\(MoneyText.approx(monthly, model.base)) a month").fontWeight(.semibold)
                        }
                        .font(.sans(14.5))
                        if let ahead = ahead(active), ahead.days > 0 {
                            HStack {
                                Text("across the \(ahead.days) days left")
                                Spacer()
                                Text(MoneyText.approx(ahead.total, model.base))
                            }
                            .font(.sans(13)).foregroundStyle(Palette.tx2)
                        }
                    }
                    .padding(.top, 10)
                    if store.canEdit {
                        addButton.frame(maxWidth: .infinity, alignment: .leading).padding(.top, 12)
                    }
                }
            }
        }
    }

    private var addButton: some View {
        Button { editor.sub = SubTarget(sub: nil) } label: {
            Label("Subscription", systemImage: "plus")
                .font(.sans(15, weight: .semibold))
                .foregroundStyle(Palette.ac2Deep)
                .padding(.horizontal, 16).padding(.vertical, 10)
                .background(Palette.ac2Soft, in: .rect(cornerRadius: Radius.rCtl))
        }
        .buttonStyle(.plain)
    }

    /// "3 active · ≈ 8 800 Ft a month · iCloud tomorrow"
    private func summary(_ active: [Subscription], _ monthly: Double) -> Text {
        let head = Text(active.isEmpty ? "none active" : "\(active.count) active · \(MoneyText.approx(monthly, model.base)) a month")
        let dated = active.compactMap { s in Subscriptions.nextCharge(s, from: model.today).map { (s, Days.between(model.today, $0)) } }
        guard let soon = dated.filter({ $0.1 <= 7 }).min(by: { $0.1 < $1.1 }) else { return head }
        return head + Text(" · \(soon.0.label) ") + Text(when(soon.1)).foregroundColor(Palette.warn).bold()
    }

    private func when(_ days: Int) -> String { days == 0 ? "today" : days == 1 ? "tomorrow" : "in \(days) days" }

    /// What the active ones take from tomorrow to the journey's end.
    private func ahead(_ active: [Subscription]) -> (days: Int, total: Double)? {
        guard let end = model.tripEnd, end > model.today else { return nil }
        let from = Days.add(model.today, 1)
        let total = active.reduce(0.0) { sum, s in
            sum + Double(Subscriptions.charges(s, from: from, to: end).count) * Journey.toBase(s.amount, s.cur, model.rates)
        }
        return (Days.between(model.today, end), total)
    }

    private func row(_ s: Subscription) -> some View {
        let off = s.isCancelled
        let next = off ? nil : Subscriptions.nextCharge(s, from: model.today)
        let soon = next.map { Days.between(model.today, $0) }
        return VStack(spacing: 0) {
            Divider().overlay(Palette.ln)
            HStack(alignment: .top, spacing: 12) {
                bell(s)
                Button { editor.sub = SubTarget(sub: s) } label: {
                    HStack(alignment: .top, spacing: 8) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(s.label).font(.sans(15, weight: .medium))
                                .foregroundStyle(off ? Palette.tx3 : Palette.tx)
                                .strikethrough(off).lineLimit(1)
                            detail(s, next: next, soon: soon)
                        }
                        Spacer(minLength: 6)
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(MoneyText.full(Journey.toBase(s.amount, s.cur, model.rates), model.base))
                                .font(.sans(15, weight: .semibold)).foregroundStyle(off ? Palette.tx3 : Palette.tx)
                            Text(cadence(s)).font(.sans(12.5)).foregroundStyle(Palette.tx2)
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
    }

    /// On: a reminder before it charges. One tap turns it on or off, as on the web.
    @ViewBuilder private func bell(_ s: Subscription) -> some View {
        let on = s.remind && !s.isCancelled
        let icon = Image(systemName: s.isCancelled ? "minus" : (on ? "bell.fill" : "bell.slash"))
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(on ? Palette.ac2Deep : Palette.tx3)
            .frame(width: 34, height: 34)
            .background(on ? Palette.ac2Soft : Palette.fill, in: .circle)
        if store.canEdit && !s.isCancelled {
            Button { toggleRemind(s) } label: { icon }
                .buttonStyle(.plain)
                .accessibilityLabel(on ? "Reminder on, \(SubscriptionForm.leadLabel(s.leadDays)). Turn off" : "Reminder off. Turn on")
                .sensoryFeedback(.selection, trigger: on)
        } else {
            icon
        }
    }

    private func detail(_ s: Subscription, next: String?, soon: Int?) -> some View {
        var line: Text
        if let off = s.cancelledOn {
            line = Text("cancelled \(Days.short(off))")
        } else {
            line = Text(s.everyMonths == 1 ? "on the \(SubscriptionForm.ordinal(Int(s.anchor.suffix(2)) ?? 1))"
                        : (next.map { "next \(Days.short($0))" } ?? ""))
            if s.remind { line = line + Text(" · reminds \(SubscriptionForm.leadLabel(s.leadDays))") }
            if let soon, soon <= 7 { line = line + Text(" · ") + Text(when(soon)).foregroundColor(Palette.warn).bold() }
        }
        return line.font(.sans(12.5)).foregroundStyle(Palette.tx2)
    }

    private func cadence(_ s: Subscription) -> String {
        s.everyMonths == 1 ? "monthly" : (s.everyMonths == 12 ? "yearly" : "every \(s.everyMonths) months")
    }

    private func toggleRemind(_ s: Subscription) {
        Task {
            try? await store.save { state in
                state.upsert("subscriptions", id: s.id, [
                    "remind": .bool(!s.remind),
                    "leadDays": .number(Double(s.leadDays)),
                ])
            }
        }
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
            if let error { Notice(text: error, kind: .warn) }
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
            Text("Log what you spend as you go. Money works out what a day costs and where the journey lands against your cap.")
                .font(.sans(15)).foregroundStyle(Palette.tx2)
            VStack(spacing: 0) {
                row("A daily pace", "after 3 days")
                Divider().overlay(Palette.ln)
                row("Where the journey lands", "after a week")
            }
            .padding(.horizontal, 14)
            .background(Palette.canvas, in: .rect(cornerRadius: 14))
            if let error { Notice(text: error, kind: .warn) }
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

    private func row(_ a: String, _ b: String) -> some View {
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
