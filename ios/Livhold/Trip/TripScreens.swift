import SwiftUI

// Trip as ONE timeline, read-only for now — the iOS twin of the web's Trip page
// (components/trips/Timeline.tsx, mock 15): home → leg → stop → leg → … → home,
// the rail on the left is the journey. Legs are pale mauve (the transport colour),
// solid when booked and dashed while an idea; stops are white cards with their
// stays underneath; the amber rows are the web's warnings, word for word.

struct TripScreen: View {
    @Environment(TripStore.self) private var store
    @Environment(TabRouter.self) private var router

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    content.id("top")
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
            .refreshable { await store.refresh() }
            .background(Palette.canvas.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .onChange(of: router.scrollToTop[.trip]) {
                withAnimation(Motion.settle) { proxy.scrollTo("top", anchor: .top) }
            }
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
                Text("No journey yet").font(.serif(28)).foregroundStyle(Palette.tx)
                Text("Start one on livhold.com — it shows up here as soon as it has a stop.")
                    .font(.sans(16)).foregroundStyle(Palette.tx2)
            }
            .padding(.top, 40)
        case .failed:
            VStack(alignment: .leading, spacing: 14) {
                Text("Your journey").font(.serif(28)).foregroundStyle(Palette.tx)
                Notice(text: store.error ?? "Couldn’t load your journey.", kind: .warn)
                Button("Try again") { Task { await store.refresh() } }.buttonStyle(.primary)
            }
            .padding(.top, 20)
        case .ready:
            if let trip = store.trip {
                TripTimeline(trip: trip)
            }
        }
    }
}

private struct TripTimeline: View {
    let trip: TripRow

    @Environment(\.tabZoom) private var zoom
    @Environment(TripStore.self) private var store

    private var state: TripState { trip.state }
    private var today: String { Days.today() }

    var body: some View {
        let tl = Journey.timeline(state)
        VStack(alignment: .leading, spacing: 0) {
            header
            if let error = store.error {
                // A refresh failed but the saved copy is still here: say so, quietly.
                Text("Showing the copy saved on this phone. \(error)")
                    .font(.sans(13)).foregroundStyle(Palette.tx3)
                    .padding(.bottom, 8)
            }
            ForEach(Journey.rows(tl)) { row in
                switch row {
                case .home(let start):
                    HomeRow(start: start, home: tl.home, endDate: state.meta.endDate)
                case .leg(let leg):
                    LegRow(leg: leg, state: state, today: today)
                case .stop(let seg, let maybe):
                    NavigationLink(value: Route.stop(seg.id)) {
                        StopRow(seg: seg, maybe: maybe, state: state, today: today)
                    }
                    .buttonStyle(.plain)
                }
            }
            footer(tl)
            orphans(tl)
        }
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                let kicker = Journey.kicker(state, today: today)
                if !kicker.isEmpty {
                    Text(kicker)
                        .font(.sans(13, weight: .medium))
                        .textCase(.uppercase)
                        .tracking(1.2)
                        .foregroundStyle(Palette.tx3)
                }
                Text(trip.name ?? state.meta.tripName ?? "Your journey")
                    .font(.serif(28))
                    .foregroundStyle(Palette.tx)
            }
            Spacer()
            NavigationLink(value: Route.tripSettings) {
                Image(systemName: "gearshape")
            }
            .buttonStyle(.icon)
            .accessibilityLabel("Trip settings")
        }
        .padding(.bottom, 12)
    }

    @ViewBuilder private func footer(_ tl: Journey.Timeline) -> some View {
        if !tl.stops.isEmpty {
            let placed = tl.stops.reduce(0) { $0 + Journey.nights($1) }
            let total = Days.between(state.meta.startDate, state.meta.endDate)
            Text(total > 0 ? "\(placed) of \(total) nights placed" : "\(placed) \(placed == 1 ? "night" : "nights") placed")
                .font(.sans(16, weight: .medium))
                .foregroundStyle(Palette.tx2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
                .padding(.top, 8)
        } else {
            Text("No stops yet.")
                .font(.sans(16)).foregroundStyle(Palette.tx2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(18)
                .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
                .padding(.top, 8)
        }
    }

    @ViewBuilder private func orphans(_ tl: Journey.Timeline) -> some View {
        if !tl.orphans.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Text("Transport not on a leg")
                    .font(.sans(13, weight: .medium)).textCase(.uppercase).tracking(1.2)
                    .foregroundStyle(Palette.tx3)
                Text("These go to or from a city that is not a stop yet.")
                    .font(.sans(13)).foregroundStyle(Palette.tx2)
                ForEach(tl.orphans) { t in
                    LegStrip(entry: t, leg: nil, state: state, today: today)
                }
            }
            .padding(.top, 20)
        }
    }
}

// MARK: - rail

/// The line down the left and the node on it. Web `Rail`.
private struct Rail: View {
    enum Line { case solid, booked, dashed }
    enum Node { case home, stop, current, maybe }

    let line: Line
    var node: Node?
    var clipTop = false
    var clipBottom = false
    var nodeTop: CGFloat = 20

    var body: some View {
        GeometryReader { geo in
            let top = clipTop ? nodeTop : 0
            let bottom = clipBottom ? nodeTop : geo.size.height
            Path { p in
                p.move(to: CGPoint(x: 12, y: top))
                p.addLine(to: CGPoint(x: 12, y: max(top, bottom)))
            }
            .stroke(lineColor, style: StrokeStyle(lineWidth: 2, dash: line == .dashed ? [4, 4] : []))
            if let node {
                nodeView(node)
                    .position(x: 12, y: nodeTop)
            }
        }
        .frame(width: 24)
        .accessibilityHidden(true)
    }

    private var lineColor: Color {
        switch line {
        case .solid: Palette.ln3
        case .booked, .dashed: Palette.ac2Line
        }
    }

    @ViewBuilder private func nodeView(_ n: Node) -> some View {
        switch n {
        case .home:
            Circle().fill(Palette.canvas).overlay(Circle().strokeBorder(Palette.ac, lineWidth: 2)).frame(width: 12, height: 12)
        case .stop:
            Circle().fill(Palette.ac).frame(width: 12, height: 12)
        case .current:
            Circle().fill(Palette.ac).frame(width: 12, height: 12)
                .background(Circle().fill(Palette.acSoft).frame(width: 20, height: 20))
        case .maybe:
            Circle().fill(Palette.ln3).frame(width: 12, height: 12)
        }
    }
}

private struct HomeRow: View {
    let start: Bool
    let home: String
    let endDate: String?

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Rail(line: .solid, node: .home, clipTop: start, clipBottom: !start, nodeTop: 14)
            Text(label)
                .font(.sans(16, weight: .medium))
                .foregroundStyle(Palette.tx2)
                .padding(.vertical, 4)
            Spacer(minLength: 0)
        }
        .frame(minHeight: 28)
    }

    private var label: String {
        if start { return home.isEmpty ? "Home · set where you live in Trip settings" : "Home · \(home)" }
        return "Home again · " + (endDate.map { Days.short($0) } ?? "no date yet")
    }
}

// MARK: - legs

private struct LegRow: View {
    let leg: Journey.Leg
    let state: TripState
    let today: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Rail(line: leg.booked != nil ? .booked : .dashed)
            VStack(spacing: 6) {
                if leg.transport.isEmpty {
                    EmptyLegStrip(leg: leg)
                } else {
                    ForEach(leg.transport) { entry in
                        LegStrip(entry: entry, leg: leg, state: state, today: today)
                    }
                }
            }
            .padding(.vertical, 6)
        }
    }
}

private struct EmptyLegStrip: View {
    let leg: Journey.Leg

    var body: some View {
        HStack {
            Text(leg.wayHome ? "Home · not planned yet" : "No transport yet")
                .font(.sans(16, weight: .semibold))
                .foregroundStyle(leg.wayHome ? Palette.tx2 : Palette.ac2)
                .lineLimit(1)
            Spacer(minLength: 8)
            if !leg.wayHome {
                Text("\(leg.from.city) → \(leg.to.city)")
                    .font(.sans(13)).foregroundStyle(Palette.tx3).lineLimit(1)
            }
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 44)
        .overlay(
            RoundedRectangle(cornerRadius: Radius.r - 6)
                .strokeBorder(Palette.ac2Line, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
        )
    }
}

/// One transport entry on a leg. Web `LegStrip`.
private struct LegStrip: View {
    let entry: TransportLeg
    /// nil for an entry that sits on no leg.
    let leg: Journey.Leg?
    let state: TripState
    let today: String

    var body: some View {
        let booked = Journey.isBooked(entry.status)
        let money = Journey.legMoney(entry, today: today)
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 8) {
                if let symbol = TransportIcon.symbol(entry.type) {
                    Image(systemName: symbol).font(.system(size: 14, weight: .semibold))
                }
                Text(title)
                    .font(.sans(16, weight: .medium))
                    .lineLimit(1)
                Spacer(minLength: 8)
                if entry.price > 0 {
                    Text(Journey.money(Journey.toBase(entry.price, entry.cur, state.rates), state.meta.baseCurrency))
                        .font(.sans(16, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Palette.tx)
                }
            }
            .foregroundStyle(Palette.ac2Deep)
            (Text(detail) + Text(money.label).foregroundColor(money.tone.color))
                .font(.sans(13))
                .foregroundStyle(Palette.tx2)
                .lineLimit(1)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(booked ? Palette.ac2Soft : .clear, in: .rect(cornerRadius: Radius.r - 6))
        .overlay {
            if !booked {
                RoundedRectangle(cornerRadius: Radius.r - 6)
                    .strokeBorder(Palette.ac2Line, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var title: String {
        var s = entry.type.isEmpty ? "Transport" : entry.type.prefix(1).uppercased() + entry.type.dropFirst()
        if let d = entry.date { s += " · \(Days.short(d))" }
        if let t = entry.time, !t.isEmpty { s += " \(t)" }
        return s
    }

    private var detail: String {
        var s = leg == nil ? "\(entry.from) → \(entry.to) · " : ""
        if let via = entry.via, !via.isEmpty {
            s += "via \(via)"
            if let h = entry.hours, h > 0 { s += " · \(Days.hours(h))" }
            s += " · "
        }
        return s
    }
}

enum TransportIcon {
    /// Lucide's Plane / TrainFront / Bus / Ship on the web.
    static func symbol(_ type: String) -> String? {
        switch type.lowercased() {
        case "flight": "airplane"
        case "train": "tram.fill"
        case "bus": "bus.fill"
        case "ferry": "ferry.fill"
        default: nil
        }
    }
}

extension Journey.Tone {
    var color: Color {
        switch self {
        case .ok: Palette.ac
        case .warn: Palette.warn
        case .muted: Palette.tx3
        }
    }
}

// MARK: - stops

private struct StopRow: View {
    let seg: Segment
    let maybe: Bool
    let state: TripState
    let today: String

    @Environment(\.tabZoom) private var zoom

    var body: some View {
        let current = !maybe && Journey.isCurrent(seg, today: today)
        HStack(alignment: .top, spacing: 12) {
            Rail(line: .solid, node: maybe ? .maybe : current ? .current : .stop, nodeTop: 36)
            StopCard(seg: seg, maybe: maybe, current: current, state: state, today: today)
                .modifier(ZoomSource(id: Route.stop(seg.id), namespace: zoom))
                .padding(.vertical, 6)
        }
        .settlesOnScroll()
    }
}

/// Web `StopCard`, read-only: city, dates, nights, progress when you're there, and
/// the stays with their money state — or what's missing, in amber.
struct StopCard: View {
    let seg: Segment
    let maybe: Bool
    let current: Bool
    let state: TripState
    let today: String

    var body: some View {
        let nights = Journey.nights(seg)
        let stays = state.stays.filter { $0.segId == seg.id }
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(seg.city.isEmpty ? "Stop" : seg.city)
                        .font(.serif(21))
                        .foregroundStyle(Palette.tx)
                        .lineLimit(1)
                    Text((seg.country.isEmpty ? "" : "\(seg.country) · ") + "\(Days.short(seg.arrive)) → \(Days.short(seg.depart))")
                        .font(.sans(15))
                        .foregroundStyle(Palette.tx2)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 0) {
                    Text("\(nights)").font(.sans(19, weight: .semibold)).foregroundStyle(Palette.tx)
                    Text(nights == 1 ? "night" : "nights")
                        .font(.sans(13)).textCase(.uppercase).tracking(1).foregroundStyle(Palette.tx2)
                }
            }
            if current, nights > 0 {
                ProgressTrack(value: Journey.progress(seg, today: today).fraction)
            }
            StayList(seg: seg, stays: stays, inPlan: !maybe, state: state, today: today)
        }
        .padding(18)
        .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
        .opacity(maybe ? 0.6 : 1)
        .contentShape(.rect(cornerRadius: Radius.r))
    }
}

/// A stop's stays and its warnings. Shared by the card and the stop screen.
struct StayList: View {
    let seg: Segment
    let stays: [Stay]
    let inPlan: Bool
    let state: TripState
    let today: String

    var body: some View {
        let cov = Journey.coverage(seg, stays)
        let uncounted = stays.filter { $0.include != true }
        VStack(alignment: .leading, spacing: 0) {
            Divider().overlay(Palette.ln)
            ForEach(cov.covered, id: \.stay.id) { item in
                let money = Journey.stayMoney(item.stay, today: today)
                let total = Journey.toBase(Journey.stayTotal(item.stay, seg), item.stay.cur, state.rates)
                row {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.stay.name.isEmpty ? "Stay" : item.stay.name)
                            .font(.sans(16, weight: .medium)).foregroundStyle(Palette.tx).lineLimit(1)
                        Text("\(Days.short(item.range.from)) – \(Days.short(item.range.to)) · \(item.range.nights) \(item.range.nights == 1 ? "night" : "nights")")
                            .font(.sans(13)).foregroundStyle(Palette.tx2).lineLimit(1)
                        Text(money.label)
                            .font(.sans(13)).foregroundStyle(money.tone.color).lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    if total > 0 {
                        Text(Journey.money(total, state.meta.baseCurrency))
                            .font(.sans(16, weight: .semibold)).monospacedDigit().foregroundStyle(Palette.tx)
                    }
                }
            }
            ForEach(uncounted) { stay in
                row {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(stay.name.isEmpty ? "Stay" : stay.name)
                            .font(.sans(16, weight: .medium)).foregroundStyle(Palette.tx).lineLimit(1)
                        Text("old option · not counted").font(.sans(13)).foregroundStyle(Palette.tx2)
                    }
                    Spacer()
                }
                .opacity(0.55)
            }
            if inPlan {
                ForEach(cov.gaps, id: \.self) { g in
                    row {
                        Text("No bed \(Days.short(g.from)) → \(Days.short(g.to))").font(.sans(16, weight: .medium))
                        Spacer()
                        Text("\(g.nights) \(g.nights == 1 ? "night" : "nights")").font(.sans(13))
                    }
                    .foregroundStyle(Palette.warn)
                }
            }
            ForEach(cov.overlaps, id: \.self) { o in
                Text("Two stays overlap \(Days.short(o.from)) – \(Days.short(o.to)) · \(o.nights) \(o.nights == 1 ? "night" : "nights") counted twice")
                    .font(.sans(13, weight: .medium)).foregroundStyle(Palette.warn)
                    .padding(.vertical, 8)
            }
            if stays.isEmpty {
                Text(inPlan ? "No stay yet" : "Nights not counted")
                    .font(.sans(16, weight: .medium))
                    .foregroundStyle(inPlan ? Palette.warn : Palette.tx3)
                    .padding(.vertical, 10)
            }
        }
    }

    private func row<C: View>(@ViewBuilder _ content: () -> C) -> some View {
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 12) { content() }
                .padding(.vertical, 10)
            Divider().overlay(Palette.ln)
        }
    }
}

// MARK: - a stop, opened

/// A stop opens as a place: a landscape header with the name large over it, so the
/// card visibly grows into a scene (2026-09-27). The wash stands in for a photo.
struct StopScreen: View {
    let segmentId: String
    @Environment(TripStore.self) private var store

    var body: some View {
        if let state = store.trip?.state, let seg = state.segments.first(where: { $0.id == segmentId }) {
            StopPage(seg: seg, state: state)
        } else {
            Text("This stop is no longer on the journey.")
                .font(.sans(16)).foregroundStyle(Palette.tx2)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Palette.canvas.ignoresSafeArea())
        }
    }
}

private struct StopPage: View {
    let seg: Segment
    let state: TripState
    private var today: String { Days.today() }

    var body: some View {
        let tl = Journey.timeline(state)
        let arriving = tl.legs.first { $0.to.seg?.id == seg.id }
        let leaving = tl.legs.first { $0.from.seg?.id == seg.id }
        let current = Journey.isCurrent(seg, today: today)
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                hero(current: current)
                VStack(alignment: .leading, spacing: 16) {
                    section("Stays") {
                        StayList(seg: seg, stays: state.stays.filter { $0.segId == seg.id }, inPlan: seg.inPlan, state: state, today: today)
                            .padding(.horizontal, 18)
                            .padding(.bottom, 4)
                            .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
                    }
                    if let arriving { legSection("Getting here", arriving) }
                    if let leaving { legSection(leaving.wayHome ? "Going home" : "Leaving for \(leaving.to.city)", leaving) }
                    if let notes = seg.notes, !notes.isEmpty {
                        section("Notes") {
                            Text(notes).font(.sans(16)).foregroundStyle(Palette.tx)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(18)
                                .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
        }
        .ignoresSafeArea(edges: .top)
        .background(Palette.canvas.ignoresSafeArea())
        .toolbarBackground(.hidden, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func hero(current: Bool) -> some View {
        let nights = Journey.nights(seg)
        return ZStack(alignment: .bottomLeading) {
            Wash.light.base
            Image(Wash.light.image)
                .resizable()
                .scaledToFill()
                .frame(height: 340, alignment: .bottom)
                .clipped()
            LinearGradient(
                colors: [Palette.canvas.opacity(0), Palette.canvas.opacity(0.85), Palette.canvas],
                startPoint: .init(x: 0.5, y: 0.45),
                endPoint: .bottom
            )
            VStack(alignment: .leading, spacing: 6) {
                if current {
                    let p = Journey.progress(seg, today: today)
                    Text("You’re here · night \(p.night) of \(p.nights)")
                        .font(.sans(13, weight: .semibold)).textCase(.uppercase).tracking(1.2)
                        .foregroundStyle(Palette.ac)
                }
                Text(seg.city.isEmpty ? "Stop" : seg.city)
                    .font(.serif(44, weight: .medium, relativeTo: .largeTitle))
                    .foregroundStyle(Palette.tx)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text((seg.country.isEmpty ? "" : "\(seg.country) · ") + "\(Days.short(seg.arrive)) → \(Days.short(seg.depart)) · \(nights) \(nights == 1 ? "night" : "nights")")
                    .font(.sans(16, weight: .medium))
                    .foregroundStyle(Palette.tx2)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 12)
        }
        .frame(height: 340)
    }

    private func section<C: View>(_ title: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.sans(13, weight: .medium)).textCase(.uppercase).tracking(1.2)
                .foregroundStyle(Palette.tx3)
            content()
        }
    }

    private func legSection(_ title: String, _ leg: Journey.Leg) -> some View {
        section(title) {
            VStack(spacing: 6) {
                if leg.transport.isEmpty {
                    EmptyLegStrip(leg: leg)
                } else {
                    ForEach(leg.transport) { LegStrip(entry: $0, leg: leg, state: state, today: today) }
                }
            }
        }
    }
}

// MARK: - trip settings (read-only)

struct TripSettingsScreen: View {
    @Environment(TripStore.self) private var store

    var body: some View {
        List {
            if let trip = store.trip {
                let meta = trip.state.meta
                Section {
                    LabeledContent("Name", value: trip.name ?? meta.tripName ?? "—")
                    LabeledContent("Dates", value: "\(Days.short(meta.startDate)) → \(meta.endDate.map { Days.short($0) } ?? "open-ended")")
                    LabeledContent("Home", value: meta.homeBase ?? "—")
                    LabeledContent("Currency", value: meta.baseCurrency)
                    if let cap = meta.budgetCap, cap > 0 {
                        LabeledContent("Budget cap", value: Journey.money(cap, meta.baseCurrency))
                    }
                } footer: {
                    Text("Change these on livhold.com for now.")
                }
            }
        }
        .font(.sans(16))
        .scrollContentBackground(.hidden)
        .background(Palette.canvas.ignoresSafeArea())
        .navigationTitle("Trip settings")
        .navigationBarTitleDisplayMode(.inline)
    }
}
