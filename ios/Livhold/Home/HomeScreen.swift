import SwiftUI
import Supabase

// Home, as agreed in mock rounds 1–3 (Patrik, 2 Oct): everything but the feed.
// The phase decides the page, as on the web's DashboardClient:
//   before the journey  → the first stop, its countdown, Before you fly, the estimate
//   on the road         → the stop card (with its money line), Coming up
//   arrival day         → the stop card, "Arrived in …"
//   between stops       → a card saying no stop covers tonight, and where next
//   after the journey   → the recap in figures, Plan the next journey
//   no journey          → Where to?
// Left out on purpose: the big Check in button (the tab bar has it), the money
// card on the road (the stop card's line instead), the off-route card (#134),
// "Next" (the stop card opens Trip), your people (their own round).

struct HomeScreen: View {
    @Environment(AuthStore.self) private var auth
    @Environment(TripStore.self) private var store
    @Environment(TabRouter.self) private var router
    @State private var planning = false
    @State private var events = HomeEvents()

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    content.id("top")
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, GlassTabBar.reservedHeight + 24)
            }
            .background(Palette.canvas.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .onChange(of: router.scrollToTop[.home]) {
                withAnimation(.smooth) { proxy.scrollTo("top", anchor: .top) }
            }
        }
        .sheet(isPresented: $planning) { NewJourneySheet().environment(store) }
        .task(id: store.trip?.id) { events = await store.homeEvents() }
    }

    @ViewBuilder private var content: some View {
        let today = Days.today()
        switch store.phase {
        case .loading:
            VStack(spacing: 14) {
                TravelLoader()
                Text("Getting your journey").font(.sans(15)).foregroundStyle(Palette.tx2)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 180)
        case .failed:
            header(eyebrow: Self.longDate(today), title: greeting, sub: nil)
            Notice(verbatim: store.error ?? String(localized: "Couldn’t load your journey."), kind: .warn)
            Button("Try again") { Task { await store.refresh() } }.buttonStyle(.primary)
        case .empty:
            header(eyebrow: Self.longDate(today), title: greeting, sub: nil)
            NoJourneyCard { planning = true }
        case .ready:
            if let trip = store.trip {
                let state = trip.state
                if let start = state.meta.startDate, !start.isEmpty, today < start {
                    BeforeJourney(trip: trip, today: today, header: header)
                } else if Journey.isFinished(state, today: today) {
                    AfterJourney(trip: trip, checkIns: events.checkIns, header: header) { planning = true }
                } else {
                    OnTheRoad(trip: trip, today: today, events: $events, header: header)
                }
            }
        }
    }

    private var greeting: String {
        auth.firstName.map { String(localized: "Hi, \($0)") } ?? String(localized: "Hi, traveller")
    }

    /// The eyebrow (today's date), the journey's name and one line under it, with
    /// the avatar that opens Account.
    private func header(eyebrow: String, title: String, sub: String?) -> AnyView {
        AnyView(
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(verbatim: eyebrow)
                        .font(.sans(12.5, weight: .medium)).textCase(.uppercase).tracking(1.6)
                        .foregroundStyle(Palette.ac2Deep)
                    Text(verbatim: title).font(.serif(28)).foregroundStyle(Palette.tx)
                        .fixedSize(horizontal: false, vertical: true)
                    if let sub {
                        Text(verbatim: sub).font(.sans(15)).foregroundStyle(Palette.tx2)
                    }
                }
                Spacer(minLength: 0)
                NavigationLink(value: Route.account) {
                    Avatar(name: auth.firstName ?? auth.email ?? "L")
                }
                .accessibilityLabel("Account")
            }
            .padding(.bottom, 4)
        )
    }

    /// "Friday 2 October" in the phone's language; with the year after the journey.
    /// Takes the same `today` as the rest of the page.
    static func longDate(_ iso: String, year: Bool = false) -> String {
        guard let d = Days.date(iso) else { return iso }
        var style = year ? Date.FormatStyle.dateTime.weekday(.wide).day().month(.wide).year()
                         : Date.FormatStyle.dateTime.weekday(.wide).day().month(.wide)
        style.timeZone = TimeZone(identifier: "UTC")!
        return d.formatted(style)
    }
}

typealias HomeHeader = (_ eyebrow: String, _ title: String, _ sub: String?) -> AnyView

// MARK: - on the road

private struct OnTheRoad: View {
    let trip: TripRow
    let today: String
    @Binding var events: HomeEvents
    let header: HomeHeader
    @Environment(TripStore.self) private var store
    @Environment(TabRouter.self) private var router

    var body: some View {
        let state = trip.state
        let inPlan = state.segments.filter(\.inPlan).sorted { $0.arrive < $1.arrive }
        let current = Journey.current(in: state, today: today)
        let day = Journey.tripDay(state.meta, today: today)
        let total = Self.tripLength(state)
        let where_: String = current.map { cur in
            String(localized: "stop \((inPlan.firstIndex { $0.id == cur.id } ?? 0) + 1) of \(inPlan.count)")
        } ?? String(localized: "between stops")
        let dayText: String? = day.map { d in
            total.map { String(localized: "Day \(d) of \($0)") } ?? String(localized: "Day \(d)")
        }
        header(HomeScreen.longDate(today), state.meta.tripName ?? trip.name ?? "",
               [dayText, where_].compactMap { $0 }.joined(separator: " · "))

        if let cur = current {
            HomeStopCard(trip: trip, seg: cur, today: today)
            if cur.arrive == today && !events.arrived(in: cur.city) && store.canEdit {
                Button {
                    events.arrivedCities.insert(Journey.normCity(cur.city))
                    Task { await store.recordArrived(city: cur.city) }
                } label: {
                    Label("Arrived in \(cur.city)", systemImage: "airplane.arrival")
                        .font(.sans(16, weight: .semibold))
                        .frame(maxWidth: .infinity, minHeight: 50)
                        .foregroundStyle(Palette.ac2Deep)
                        .background(Palette.ac2Soft, in: .rect(cornerRadius: Radius.rCtl))
                }
                .buttonStyle(.plain)
                .sensoryFeedback(.success, trigger: events.arrivedCities.count)
            }
        } else {
            BetweenCard(next: inPlan.first { $0.arrive > today })
        }
        OfflinePill()
        RemindersCard(trip: trip, today: today, mode: .comingUp)
    }

    /// The journey's length in days, Day 1 = departure (progress.ts tripLength).
    static func tripLength(_ state: TripState) -> Int? {
        if let s = state.meta.startDate, let e = state.meta.endDate, !s.isEmpty, !e.isEmpty, e >= s {
            return Days.between(s, e) + 1
        }
        let nights = state.segments.filter(\.inPlan).reduce(0) { $0 + Journey.nights($1) }
        return nights > 0 ? nights : nil
    }
}

/// The stop you're in: the card opens it on Trip, its foot opens Money.
private struct HomeStopCard: View {
    let trip: TripRow
    let seg: Segment
    let today: String
    @Environment(TripStore.self) private var store
    @Environment(TabRouter.self) private var router

    var body: some View {
        let state = trip.state
        let p = Journey.progress(seg, today: today)
        let arrival = seg.arrive == today
        VStack(alignment: .leading, spacing: 0) {
            Button {
                router.paths[.trip] = [.stop(seg.id)]
                router.select(.trip)
            } label: {
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        HStack(spacing: 7) {
                            Circle().fill(Palette.ac).frame(width: 7, height: 7)
                            (arrival ? Text("Arrival day") : Text("On plan"))
                                .font(.sans(12.5, weight: .semibold)).textCase(.uppercase).tracking(1.3)
                                .foregroundStyle(Palette.ac)
                        }
                        Spacer()
                        Text("Night \(p.night) of \(p.nights)").font(.sans(14, weight: .medium)).foregroundStyle(Palette.tx2)
                    }
                    HStack(alignment: .lastTextBaseline) {
                        Text(verbatim: seg.city).font(.serif(30)).foregroundStyle(Palette.tx)
                            .lineLimit(2).minimumScaleFactor(0.8)
                        Spacer()
                        Image(systemName: "chevron.right").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ac2)
                    }
                    .padding(.top, 8)
                    stayLine(state)
                        .font(.sans(15)).foregroundStyle(Palette.tx2)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 3)
                    if !arrival {
                        ProgressTrack(value: p.fraction).padding(.top, 12)
                        let left = max(0, p.nights - p.night)
                        Text("\(left) nights left")
                            .font(.sans(14, weight: .semibold)).foregroundStyle(Palette.ac2)
                            .frame(maxWidth: .infinity, alignment: .trailing)
                            .padding(.top, 6)
                    }
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityHint(Text("Opens the stop on Trip"))

            if store.tracking == .yes {
                MoneyLine(trip: trip, seg: seg, today: today)
            }
        }
        .padding(18)
        .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
    }

    /// Tonight's bed by the timeline's rule: amber when it isn't booked or there is none.
    private func stayLine(_ state: TripState) -> Text {
        let stays = state.stays.filter { $0.segId == seg.id }
        let cov = Journey.coverage(seg, stays)
        let tonight = cov.covered.first { $0.range.from <= today && today < $0.range.to }?.stay
        let leave = Text("leave \(Days.short(seg.depart))")
        let sep = Text(verbatim: " · ")
        if let st = tonight {
            let name = Text(verbatim: Journey.stayName(st, in: seg))
            return Journey.isBooked(st.status)
                ? name + sep + leave
                : name + sep + Text("not booked").foregroundColor(Palette.warn) + sep + leave
        }
        let none = cov.covered.isEmpty ? Text("No stay yet") : Text("No bed tonight")
        return none.foregroundColor(Palette.warn) + sep + leave
    }
}

/// "Spent here 24 600 Ft · 8 200 Ft a day": the stop's everyday costs so far and,
/// from its third day, its pace (Money's This stop view). Opens Money.
private struct MoneyLine: View {
    let trip: TripRow
    let seg: Segment
    let today: String
    @Environment(TripStore.self) private var store
    @Environment(TabRouter.self) private var router

    var body: some View {
        let model = MoneyModel(trip: trip, ledger: trip.ledger, cities: store.cityCosts, today: today)
        let to = today < seg.depart ? today : seg.depart
        let burn = MoneyModel.burnRate(model.ledger, model.rates, from: seg.arrive, to: to)
        Button {
            router.select(.money)
        } label: {
            HStack(spacing: 4) {
                (Text("Spent here ") + Text(MoneyText.full(burn.total, model.base)).foregroundColor(Palette.tx).bold()
                 + (burn.days >= 3 ? Text(verbatim: " · ") + Text("\(MoneyText.full(burn.perDay, model.base)) a day") : Text(verbatim: "")))
                    .font(.sans(14.5)).foregroundStyle(Palette.tx2)
                    .monospacedDigit()
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.tx3)
            }
            .padding(.top, 12)
            .frame(minHeight: 44)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .overlay(alignment: .top) { Rectangle().fill(Palette.ln).frame(height: 1).padding(.top, 2) }
        .padding(.top, 10)
        .accessibilityHint(Text("Opens Money"))
    }
}

/// A night no stop covers: a gap in the plan, or a night bus.
private struct BetweenCard: View {
    let next: Segment?
    @Environment(TabRouter.self) private var router

    var body: some View {
        Button {
            if let next { router.paths[.trip] = [.stop(next.id)] }
            router.select(.trip)
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                Text("Between stops").font(.sans(12.5, weight: .semibold)).textCase(.uppercase).tracking(1.3)
                    .foregroundStyle(Palette.tx2)
                HStack(alignment: .lastTextBaseline) {
                    Text("On the way").font(.serif(30)).foregroundStyle(Palette.tx)
                    Spacer()
                    Image(systemName: "chevron.right").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ac2)
                }
                .padding(.top, 8)
                (Text("No stop planned for tonight").foregroundColor(Palette.warn)
                 + (next.map { Text(verbatim: " · ") + Text("\($0.city) from \(Days.short($0.arrive))") } ?? Text(verbatim: "")))
                    .font(.sans(15)).foregroundStyle(Palette.tx2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 3)
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }
}

/// No signal: say so, and that edits wait for the connection.
private struct OfflinePill: View {
    var body: some View {
        if !Connectivity.shared.isOnline {
            Label("Offline · edits sync when you’re back online", systemImage: "antenna.radiowaves.left.and.right.slash")
                .font(.sans(13.5, weight: .medium))
                .foregroundStyle(Palette.warn)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Palette.warnSoft, in: .capsule)
                .frame(maxWidth: .infinity)
                .transition(.opacity)
        }
    }
}

// MARK: - before the journey

private struct BeforeJourney: View {
    let trip: TripRow
    let today: String
    let header: HomeHeader
    @Environment(TabRouter.self) private var router

    var body: some View {
        let state = trip.state
        let inPlan = state.segments.filter(\.inPlan).sorted { $0.arrive < $1.arrive }
        let nights = inPlan.reduce(0) { $0 + Journey.nights($1) }
        let travellers = Int(state.meta.travelers ?? 1)
        header(HomeScreen.longDate(today), state.meta.tripName ?? trip.name ?? "",
               [String(localized: "\(inPlan.count) stops"), String(localized: "\(nights) nights"),
                String(localized: "\(travellers) travellers")].joined(separator: " · "))
        if let first = inPlan.first {
            Button {
                router.paths[.trip] = [.stop(first.id)]
                router.select(.trip)
            } label: {
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        HStack(spacing: 7) {
                            Circle().fill(Palette.ac2).frame(width: 7, height: 7)
                            Text("First stop").font(.sans(12.5, weight: .semibold)).textCase(.uppercase).tracking(1.3)
                                .foregroundStyle(Palette.ac2)
                        }
                        Spacer()
                        Text("\(Journey.nights(first)) nights").font(.sans(14, weight: .medium)).foregroundStyle(Palette.tx2)
                    }
                    HStack(alignment: .lastTextBaseline) {
                        Text(verbatim: first.city).font(.serif(32)).foregroundStyle(Palette.tx)
                        Spacer()
                        Image(systemName: "chevron.right").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ac2)
                    }
                    .padding(.top, 8)
                    Text(verbatim: [first.country, String(localized: "from \(Days.short(first.arrive))")]
                        .filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.sans(15)).foregroundStyle(Palette.tx2).padding(.top, 3)
                    if let start = state.meta.startDate {
                        let days = Days.between(today, start)
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(verbatim: "\(days)").font(.sans(44, weight: .semibold)).foregroundStyle(Palette.ac2)
                                .monospacedDigit()
                            Text(days == 1 ? "day to departure" : "days to departure")
                                .font(.sans(17, weight: .medium)).foregroundStyle(Palette.tx2)
                        }
                        .padding(.top, 12)
                    }
                }
                .padding(18)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
        } else {
            Button { router.select(.trip) } label: {
                (Text("No stops yet. Add the first place you’re going on Trip") + Text(verbatim: " ›").foregroundColor(Palette.ac))
                    .font(.sans(15)).foregroundStyle(Palette.tx2)
                    .padding(18)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
            }
            .buttonStyle(.plain)
        }
        RemindersCard(trip: trip, today: today, mode: .beforeYouFly)
        if !inPlan.isEmpty { EstimateCard(trip: trip, today: today) }
    }
}

/// What the whole journey should cost (Money's "Lands near"), against the cap.
private struct EstimateCard: View {
    let trip: TripRow
    let today: String
    @Environment(TripStore.self) private var store
    @Environment(TabRouter.self) private var router

    var body: some View {
        let model = MoneyModel(trip: trip, ledger: trip.ledger, cities: store.cityCosts, today: today)
        let total = model.projection.projected
        let onAverages = model.plan.filter { $0.stayLabel == .estimate || $0.stayLabel == .none }.count
        Button { router.select(.money) } label: {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("Estimated total").font(.sans(12.5, weight: .semibold)).textCase(.uppercase).tracking(1.3)
                        .foregroundStyle(Palette.tx2)
                    Spacer()
                    if let cap = model.cap {
                        Text(verbatim: "\(Int((total / cap * 100).rounded()))%").font(.sans(15, weight: .semibold))
                            .foregroundStyle(total > cap ? Palette.warn : Palette.ac2)
                    }
                }
                Text(MoneyText.approx(total, model.base)).font(.sans(28, weight: .semibold)).foregroundStyle(Palette.tx)
                    .monospacedDigit().padding(.top, 4)
                if let cap = model.cap {
                    ProgressTrack(value: min(1, total / cap), tint: total > cap ? Palette.warn : Palette.ac).padding(.top, 10)
                    Group {
                        if total > cap {
                            Text("of \(MoneyText.full(cap, model.base)) cap · ") + Text("\(MoneyText.full(total - cap, model.base)) over").foregroundColor(Palette.warn).bold()
                        } else {
                            Text("of \(MoneyText.full(cap, model.base)) cap · ") + Text("\(MoneyText.full(cap - total, model.base)) left").foregroundColor(Palette.ac2Deep).bold()
                        }
                    }
                    .font(.sans(14)).foregroundStyle(Palette.tx2).padding(.top, 6)
                }
                if onAverages > 0 {
                    Text(onAverages == 1
                         ? "1 stop has no stay yet, so its nights are counted at the city’s average price"
                         : "\(onAverages) stops have no stay yet, so their nights are counted at each city’s average price")
                        .font(.sans(14)).foregroundStyle(Palette.warn)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - after the journey

private struct AfterJourney: View {
    let trip: TripRow
    let checkIns: Int
    let header: HomeHeader
    let planNext: () -> Void
    @Environment(TripStore.self) private var store
    @Environment(TabRouter.self) private var router

    var body: some View {
        let state = trip.state
        let recap = Journey.recap(state)
        let rates = state.rates.merging([state.meta.baseCurrency: 1]) { a, _ in a }
        let spent = trip.ledger.filter(\.isExpense).reduce(0) { $0 + Journey.toBase($1.amount, $1.currency, rates) }
        let income = trip.ledger.filter { !$0.isExpense }.reduce(0) { $0 + Journey.toBase($1.amount, $1.currency, rates) }
        let cap = state.meta.budgetCap ?? 0
        let left = cap > 0 ? cap - (spent - income) : nil
        let base = state.meta.baseCurrency
        let span = [state.meta.startDate, state.meta.endDate].compactMap { $0.map { Days.withYear($0) } }.joined(separator: " – ")
        header(HomeScreen.longDate(Days.today(), year: true), String(localized: "Home again"),
               [state.meta.tripName ?? trip.name ?? "", span].filter { !$0.isEmpty }.joined(separator: " · "))

        VStack(alignment: .leading, spacing: 12) {
            Text("The journey in figures").font(.sans(12.5, weight: .semibold)).textCase(.uppercase).tracking(1.3)
                .foregroundStyle(Palette.ac2Deep)
            Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 14) {
                GridRow {
                    figure(String(localized: "recap.nights.title", defaultValue: "Nights"), "\(recap.nights)")
                    figure(String(localized: "recap.stops.title", defaultValue: "Stops"), "\(recap.stops)")
                    figure(String(localized: "recap.countries.title", defaultValue: "Countries"), "\(recap.countries)")
                }
                Divider().overlay(Palette.ln).gridCellUnsizedAxes(.horizontal)
                GridRow {
                    figure(String(localized: "Check-ins"), "\(checkIns)", tone: Palette.ac2)
                    figure(String(localized: "Spent"), MoneyText.short(spent, base))
                    if let left {
                        figure(left >= 0 ? String(localized: "Under cap") : String(localized: "Over cap"),
                               MoneyText.short(abs(left), base), tone: left >= 0 ? Palette.ac2 : Palette.warn)
                    } else {
                        Color.clear.frame(height: 1)
                    }
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(JourneyWash())

        if store.canEdit {
            Button(action: planNext) { Label("Plan the next journey", systemImage: "plus").frame(maxWidth: .infinity) }
                .buttonStyle(.primary)
        }
        row(String(localized: "Final numbers"), String(localized: "all entries, month by month")) {
            router.paths[.money] = [.moneyEntries(nil)]
            router.select(.money)
        }
        row(String(localized: "Look back"), String(localized: "the timeline and its stays")) {
            router.select(.trip)
        }
    }

    private func figure(_ label: String, _ value: String, tone: Color = Palette.tx) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: label).font(.sans(11.5, weight: .medium)).textCase(.uppercase).tracking(1.1)
                .foregroundStyle(Palette.tx2).lineLimit(1).minimumScaleFactor(0.8)
            Text(verbatim: value).font(.sans(22, weight: .semibold)).foregroundStyle(tone)
                .monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func row(_ title: String, _ sub: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: title).font(.sans(16, weight: .semibold)).foregroundStyle(Palette.tx)
                    Text(verbatim: sub).font(.sans(14)).foregroundStyle(Palette.tx2)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.ac2)
            }
            .padding(16)
            .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - reminders

/// One card, two names (Patrik, 2 Oct): "Before you fly" before the journey,
/// "Coming up" on it (reminders.ts beforeYouFly / comingUp). Your own reminders
/// tick; money ones (a free cancellation ending, a card charge) carry a dot.
/// Hidden when nothing is due. The Reminders page comes in a later round.
private struct RemindersCard: View {
    enum Mode { case beforeYouFly, comingUp }
    let trip: TripRow
    let today: String
    let mode: Mode
    @Environment(TripStore.self) private var store
    @State private var ticked: Set<String> = []

    var body: some View {
        let all = HomeReminder.derive(trip, today: today).filter { !$0.done && !ticked.contains($0.id) }
        let rows: [HomeReminder] = switch mode {
        case .beforeYouFly:
            Array(all.filter { r in r.due.map { d in trip.state.meta.startDate.map { d < $0 } ?? true } ?? false }.prefix(5))
        case .comingUp:
            Array(all.filter { $0.due != nil && ($0.overdue || Days.between(today, $0.due!) <= 7) }
                .sorted { $0.overdue == $1.overdue ? ($0.due ?? "") < ($1.due ?? "") : $0.overdue }
                .prefix(2))
        }
        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                (mode == .beforeYouFly ? Text("Before you fly") : Text("Coming up"))
                    .font(.sans(12.5, weight: .semibold)).textCase(.uppercase).tracking(1.4)
                    .foregroundStyle(Palette.ac2Deep)
                    .padding(.bottom, 4)
                ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                    if i > 0 { Divider().overlay(Palette.ln) }
                    HStack(alignment: .top, spacing: 12) {
                        if r.kind == .mine {
                            Button { tick(r) } label: {
                                Circle().strokeBorder(r.overdue ? Palette.warn : Palette.ln3, lineWidth: 2)
                                    .frame(width: 24, height: 24)
                                    .frame(width: 44, height: 44)
                                    .contentShape(.rect)
                            }
                            .buttonStyle(.plain)
                            .disabled(!store.canEdit)
                            .padding(.horizontal, -10)
                            .padding(.vertical, -10)
                            .accessibilityLabel(Text("Mark as done"))
                        } else {
                            Circle().fill(Palette.ac2).frame(width: 8, height: 8).padding(.horizontal, 8).padding(.top, 7)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: r.title).font(.sans(16, weight: .semibold)).foregroundStyle(Palette.tx)
                                .fixedSize(horizontal: false, vertical: true)
                            Text(verbatim: r.dueLabel(today: today)).font(.sans(14))
                                .foregroundStyle(r.overdue ? Palette.warn : Palette.tx2)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 11)
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 16)
            .padding(.bottom, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
            .sensoryFeedback(.success, trigger: ticked.count)
            .animation(Motion.settle, value: ticked)
        }
    }

    /// Ticks at once; the save follows. On a failure the row comes back.
    private func tick(_ r: HomeReminder) {
        ticked.insert(r.id)
        let day = today
        Task {
            do {
                try await store.save { doc in doc.upsert("reminders", id: r.id, ["doneOn": .string(day)]) }
            } catch {
                ticked.remove(r.id)
                store.saveNotice = error.localizedDescription
            }
        }
    }
}

/// A reminder as Home shows it (reminders.ts deriveReminders): yours from
/// `state.reminders`, and money deadlines worked out from booked stays.
struct HomeReminder: Identifiable, Equatable {
    enum Kind { case mine, money }
    let id: String
    let kind: Kind
    let title: String
    let due: String?
    let done: Bool
    let overdue: Bool

    static func derive(_ trip: TripRow, today: String) -> [HomeReminder] {
        var out: [HomeReminder] = []
        if case .array(let list)? = trip.rawState["reminders"] {
            for item in list {
                guard let id = item["id"]?.stringValue, !id.isEmpty else { continue }
                let due = item["due"]?.stringValue.flatMap { $0.isEmpty ? nil : String($0.prefix(10)) }
                let doneOn = item["doneOn"]?.stringValue.flatMap { $0.isEmpty ? nil : $0 }
                out.append(HomeReminder(id: id, kind: .mine, title: item["title"]?.stringValue ?? "",
                                        due: due, done: doneOn != nil,
                                        overdue: doneOn == nil && due.map { $0 < today } == true))
            }
        }
        let state = trip.state
        let base = state.meta.baseCurrency
        for st in state.stays where st.include == true && Journey.isBooked(st.status) {
            guard let seg = state.segments.first(where: { $0.id == st.segId }) else { continue }
            let amount = MoneyText.full(Journey.toBase(Journey.stayTotal(st, seg), st.cur, state.rates), base)
            let name = Journey.stayName(st, in: seg)
            if let c = st.cancelUntil, !c.isEmpty, st.remind != false, c >= today {
                out.append(HomeReminder(id: "money-cancel-\(st.id)", kind: .money,
                                        title: String(localized: "Free cancellation ends · \(name)"),
                                        due: String(c.prefix(10)), done: false, overdue: false))
            }
            if let c = st.chargeDate, !c.isEmpty, c >= today {
                out.append(HomeReminder(id: "money-charge-\(st.id)", kind: .money,
                                        title: String(localized: "Card charged · \(amount) · \(name)"),
                                        due: String(c.prefix(10)), done: false, overdue: false))
            }
        }
        return out.sorted { a, b in
            switch (a.due, b.due) {
            case let (x?, y?): x == y ? a.title < b.title : x < y
            case (nil, _?): false
            case (_?, nil): true
            case (nil, nil): a.title < b.title
            }
        }
    }

    /// "17 Sep · in 5 days", "today", "was due 8 Sep · 4 days ago" (reminders.ts dueLabel).
    func dueLabel(today: String) -> String {
        guard let due else { return String(localized: "no date") }
        let days = Days.between(today, due) - Days.between(due, today)
        let date = Days.short(due)
        if days < 0 { return String(localized: "was due \(date) · \(-days) days ago") }
        switch days {
        case 0: return String(localized: "\(date) · today")
        case 1: return String(localized: "\(date) · tomorrow")
        default: return String(localized: "\(date) · in \(days) days")
        }
    }
}

// MARK: - trip events

/// What Home needs from `trip_events`: which stops you've said you arrived in,
/// and how many check-ins the journey has.
struct HomeEvents: Equatable {
    var arrivedCities: Set<String> = []
    var checkIns = 0
    func arrived(in city: String) -> Bool { arrivedCities.contains(Journey.normCity(city)) }
}

extension TripStore {
    func homeEvents() async -> HomeEvents {
        guard let trip, let _ = userId, !Self.isFixture else { return HomeEvents() }
        struct Row: Decodable { let kind: String; let payload: JSONValue? }
        do {
            try await Connectivity.shared.waitUntilOnline()
            let rows: [Row] = try await client.from("trip_events").select("kind,payload")
                .eq("trip_id", value: trip.id).in("kind", values: ["arrived", "checkin"]).execute().value
            var e = HomeEvents()
            for r in rows {
                if r.kind == "checkin" { e.checkIns += 1 }
                if r.kind == "arrived", let city = r.payload?["city"]?.stringValue { e.arrivedCities.insert(Journey.normCity(city)) }
            }
            return e
        } catch {
            return HomeEvents()
        }
    }

    /// The web's recordArrived: one `arrived` event with the city. Its id is made
    /// here, so a retry can't record it twice.
    func recordArrived(city: String) async {
        guard let trip, let userId, !Self.isFixture else { return }
        struct Row: Encodable, Sendable {
            let id: String; let trip_id: String; let author: String; let kind: String; let payload: [String: String]
        }
        let row = Row(id: UUID().uuidString.lowercased(), trip_id: trip.id, author: userId, kind: "arrived", payload: ["city": city])
        do {
            try await Connectivity.shared.waitUntilOnline()
            try await Self.oneMoreTry { try await client.from("trip_events").insert(row).execute() }
        } catch let e as PostgrestError where e.code == "23505" {
            // Already there: the first send landed.
        } catch {
            saveNotice = AuthStore.message(for: error) ?? String(localized: "Couldn’t record the arrival. Please try again.")
        }
    }
}
