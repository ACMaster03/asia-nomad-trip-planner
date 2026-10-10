import SwiftUI

// Trip as ONE timeline, read-only for now — the iOS twin of the web's Trip page
// (components/trips/Timeline.tsx, mock 15): home → leg → stop → leg → … → home,
// the rail on the left is the journey. Legs are pale mauve (the transport colour),
// solid when booked and dashed while an idea; stops are white cards with their
// stays underneath; the amber rows are the web's warnings, word for word.

struct TripScreen: View {
    @Environment(TripStore.self) private var store
    @Environment(TabRouter.self) private var router
    /// The new-journey form (NewJourney.swift): from the empty page or a finished journey.
    @State private var planning = false

    var body: some View {
        if store.phase == .ready, let trip = store.trip {
            TripWithGlobe(trip: trip) { planning = true }
                .sheet(isPresented: $planning) {
                    NewJourneySheet().environment(store)
                }
        } else {
            plain
        }
    }

    private var plain: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    content.id("top")
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
            .refreshable {
                // Offline the fetch would wait for a connection and the spinner would
                // hang; the saved-copy line already says there's no connection.
                guard Connectivity.shared.isOnline else { return }
                await store.refresh()
            }
            .background(Palette.canvas.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .onChange(of: router.scrollToTop[.trip]) {
                withAnimation(Motion.settle) { proxy.scrollTo("top", anchor: .top) }
            }
        }
        .sheet(isPresented: $planning) {
            NewJourneySheet().environment(store)
        }
    }

    @ViewBuilder private var content: some View {
        switch store.phase {
        case .loading:
            VStack(spacing: 14) {
                TravelLoader()
                Text("Getting your journey").font(.sans(15)).foregroundStyle(Palette.tx2)
                // Nothing saved and no signal: say why it's waiting, as sign-in does.
                if let since = store.refreshStarted { WaitingNote(since: since) }
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 180)
        case .empty:
            // Everything starts in the app (Patrik, 29 Sep): nobody is sent to the website.
            NoJourneyCard { planning = true }
                .padding(.top, 40)
        case .failed:
            VStack(alignment: .leading, spacing: 14) {
                Text("Your journey").font(.serif(28)).foregroundStyle(Palette.tx)
                Notice(verbatim: store.error ?? String(localized: "Couldn’t load your journey."), kind: .warn)
                Button("Try again") { Task { await store.refresh() } }.buttonStyle(.primary)
            }
            .padding(.top, 20)
        case .ready:
            if let trip = store.trip {
                TripTimeline(trip: trip) { planning = true }
            }
        }
    }
}

struct TripTimeline: View {
    let trip: TripRow
    /// Opens the new-journey form.
    let planNext: () -> Void
    /// Off under the globe, where the header sits over the globe instead.
    var showsHeader = true

    @Environment(TripStore.self) private var store

    private var state: TripState { trip.state }
    private var today: String { Days.today() }

    var body: some View {
        let tl = Journey.timeline(state)
        let onward = Journey.onward(state, tl)
        ScrollViewReader { proxy in
            VStack(alignment: .leading, spacing: 0) {
                // State F (mocks-29sep §3): the journey has ended. Points forward; the
                // timeline stays below, and "Look back" scrolls to it.
                if Journey.isFinished(state, today: today) {
                    FinishedJourneyCard(
                        name: trip.name ?? state.meta.tripName ?? String(localized: "Your journey"),
                        state: state,
                        canEdit: store.canEdit,
                        planNext: planNext,
                        lookBack: { withAnimation(Motion.settle) { proxy.scrollTo("timeline", anchor: .top) } }
                    )
                }
                if showsHeader { TripHeader(trip: trip, today: today).id("timeline") } else { Color.clear.frame(height: 0).id("timeline") }
                if !store.canEdit { ViewerNotice().padding(.bottom, 12) }
                savedCopyLine
                if let notice = store.saveNotice {
                    Button { store.saveNotice = nil } label: {
                        Notice(verbatim: notice, kind: .warn)
                    }
                    .buttonStyle(.plain)
                    .padding(.bottom, 8)
                    .accessibilityHint("Dismiss")
                }
                ForEach(Journey.rows(tl)) { row in
                    switch row {
                    case .home(let start):
                        HomeRow(start: start, home: tl.home, endDate: state.meta.endDate, onward: onward)
                    case .leg(let leg):
                        if leg.wayHome, store.canEdit { AddStopRow() }
                        LegRow(leg: leg, state: state, today: today, onward: onward)
                    case .stop(let seg, let maybe):
                        NavigationLink(value: Route.stop(seg.id)) {
                            StopRow(seg: seg, maybe: maybe, state: state, today: today)
                        }
                        .buttonStyle(.plain)
                    }
                }
                // With nothing on the timeline, the no-stops card below offers the first stop.
                if store.canEdit, !tl.legs.contains(where: \.wayHome), !tl.stops.isEmpty || !tl.maybes.isEmpty { AddStopRow() }
                footer(tl)
                orphans(tl)
            }
        }
    }

}

/// The day, the journey's name and the gear: on top of the timeline, or over the globe.
struct TripHeader: View {
    let trip: TripRow
    let today: String
    var showsGear = true
    /// Over the globe: a soft canvas-coloured glow keeps the words readable on land and sea.
    var onGlobe = false

    private var state: TripState { trip.state }

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                let kicker = Journey.kicker(state, today: today)
                if !kicker.isEmpty {
                    Text(kicker)
                        .font(.sans(13, weight: .medium))
                        .textCase(.uppercase)
                        .tracking(1.2)
                        .foregroundStyle(Palette.ac2)
                }
                Text(trip.name ?? state.meta.tripName ?? String(localized: "Your journey"))
                    .font(.serif(28))
                    .foregroundStyle(Palette.tx)
            }
            .shadow(color: onGlobe ? Palette.canvas : .clear, radius: 4)
            .shadow(color: onGlobe ? Palette.canvas.opacity(0.8) : .clear, radius: 10)
            Spacer()
            if showsGear {
                NavigationLink(value: Route.tripSettings) {
                    Image(systemName: "gearshape")
                }
                .buttonStyle(.icon)
                .accessibilityLabel("Trip settings")
            }
        }
        .padding(.bottom, 12)
    }
}

private extension TripTimeline {

    /// No signal, or a refresh failed, while the saved copy is still here: say so,
    /// quietly, and how old it is.
    @ViewBuilder private var savedCopyLine: some View {
        let why = !Connectivity.shared.isOnline ? String(localized: "No connection.") : store.error
        if let why {
            Group {
                if let at = store.fetchedAt, at > .distantPast {
                    Text("\(why) Showing the copy saved on this phone, updated \(Self.ago(at)).")
                } else {
                    Text("\(why) Showing the copy saved on this phone.")
                }
            }
            .font(.sans(13)).foregroundStyle(Palette.tx3)
            .padding(.bottom, 8)
        }
    }

    private static func ago(_ date: Date) -> String {
        let f = RelativeDateTimeFormatter()
        f.locale = L10n.locale
        f.unitsStyle = .full
        return f.localizedString(for: min(date, .now), relativeTo: .now)
    }

    @ViewBuilder private func footer(_ tl: Journey.Timeline) -> some View {
        let placed = tl.stops.reduce(0) { $0 + Journey.nights($1) }
        let total = Days.between(state.meta.startDate, state.meta.endDate)
        if tl.stops.isEmpty, tl.maybes.isEmpty {
            // State G (mocks-29sep §3): the frame stays, the card points to the first stop.
            NoStopsCard(state: state, home: tl.home)
        }
        if !tl.stops.isEmpty || (tl.maybes.isEmpty && total > 0) {
            // "Planned", as Money says "days not planned yet" (Patrik, 29 Sep).
            (total > 0 ? Text("\(placed) of \(total) nights planned") : Text("\(placed) nights planned"))
                .font(.sans(16, weight: .medium))
                .foregroundStyle(Palette.tx2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
                .padding(.top, 8)
        }
    }

    @ViewBuilder private func orphans(_ tl: Journey.Timeline) -> some View {
        if !tl.orphans.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                CardLabel("Transport not on a leg", mauve: true)
                Text("These go to or from a city that is not a stop yet.")
                    .font(.sans(13)).foregroundStyle(Palette.tx2)
                ForEach(tl.orphans) { t in
                    EditTap(target: .transport(t, from: t.from, to: t.to, date: t.date ?? "")) {
                        LegStrip(entry: t, leg: nil, state: state, today: today)
                    }
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

/// The web's ViewerNotice, word for word: read-only reads as a property of the
/// trip, not as something broken on this screen.
private struct ViewerNotice: View {
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: "eye").font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.tx3)
            (Text("Read-only.").fontWeight(.medium).foregroundColor(Palette.tx)
                + Text(verbatim: " ")
                + Text("You were invited to this trip as a viewer, so you can see everything, but only the owner and co-editors can change it."))
                .font(.sans(15)).foregroundStyle(Palette.tx2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Palette.sf, in: .rect(cornerRadius: Radius.r - 6))
        .overlay(RoundedRectangle(cornerRadius: Radius.r - 6).strokeBorder(Palette.ln2, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}

/// "+ Add stop", where the web puts it: after the last stop, before the way on.
private struct AddStopRow: View {
    @Environment(TripEditor.self) private var editor

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Rail(line: .solid)
            Button { editor.open(.addStop) } label: {
                Label("Add stop", systemImage: "plus")
                    .font(.sans(16, weight: .semibold))
                    .foregroundStyle(Palette.ac)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .padding(.horizontal, 14)
                    .overlay(
                        RoundedRectangle(cornerRadius: Radius.r - 6)
                            .strokeBorder(Palette.acLine, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
                    )
                    .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .padding(.vertical, 6)
        }
    }
}

private struct HomeRow: View {
    let start: Bool
    let home: String
    let endDate: String?
    let onward: Bool
    @Environment(TripStore.self) private var store

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
        if start {
            // A viewer can't open Trip settings to set it: just "Home". Its own key,
            // as "Home" alone is the Home tab ("Kezdőlap"), not where you live.
            if home.isEmpty {
                return store.canEdit ? String(localized: "Home · set where you live in Trip settings")
                    : String(localized: "timeline.home", defaultValue: "Home")
            }
            return String(localized: "Home · \(home)")
        }
        let end = endDate.map { Days.short($0) } ?? String(localized: "no date yet")
        return onward ? String(localized: "Journey ends · \(end)") : String(localized: "Home · \(end)")
    }
}

// MARK: - legs

private struct LegRow: View {
    let leg: Journey.Leg
    let state: TripState
    let today: String
    let onward: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Rail(line: leg.booked != nil ? .booked : .dashed)
            LegEntries(leg: leg, state: state, today: today, onward: onward)
                .padding(.vertical, 6)
        }
    }
}

/// A leg's transport, each entry opening its editor; an empty leg opens Add.
private struct LegEntries: View {
    let leg: Journey.Leg
    let state: TripState
    let today: String
    let onward: Bool

    var body: some View {
        VStack(spacing: 6) {
            if leg.transport.isEmpty {
                EditTap(target: .transport(nil, from: leg.from.city, to: leg.to.city, date: leg.date)) {
                    EmptyLegStrip(leg: leg, onward: onward)
                }
            } else {
                ForEach(leg.transport) { entry in
                    EditTap(target: .transport(entry, from: leg.from.city, to: leg.to.city, date: leg.date)) {
                        LegStrip(entry: entry, leg: leg, state: state, today: today)
                    }
                }
            }
        }
    }
}

private struct EmptyLegStrip: View {
    let leg: Journey.Leg
    let onward: Bool
    @Environment(TripStore.self) private var store

    var body: some View {
        HStack {
            // The route under the words, not beside them: side by side both were
            // cut in Hungarian and with long city names.
            VStack(alignment: .leading, spacing: 2) {
                (leg.wayHome ? (onward ? Text("Onward") : Text("Going home")) : Text("No transport yet"))
                    .font(.sans(16, weight: .semibold))
                    .foregroundStyle(leg.wayHome ? Palette.tx2 : Palette.ac2)
                if !leg.wayHome {
                    Text(verbatim: "\(leg.from.city) → \(leg.to.city)")
                        .font(.sans(13)).foregroundStyle(Palette.tx2)
                }
            }
            Spacer(minLength: 8)
            if leg.wayHome, store.canEdit {
                Text("+ Add").font(.sans(15, weight: .semibold)).foregroundStyle(Palette.ac)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
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
            // Two lines for the title and the detail: in Hungarian one line cut the
            // time and the money state. The price keeps the first line, whole.
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                if let symbol = TransportIcon.symbol(entry.type) {
                    Image(systemName: symbol).font(.system(size: 14, weight: .semibold))
                }
                Text(title)
                    .font(.sans(16, weight: .medium))
                    .lineLimit(2)
                Spacer(minLength: 8)
                if entry.price > 0 {
                    Text(Journey.money(Journey.toBase(entry.price, entry.cur, state.rates), state.meta.baseCurrency))
                        .font(.sans(16, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Palette.tx)
                        .fixedSize()
                }
            }
            .foregroundStyle(Palette.ac2Deep)
            (Text(detail) + Text(money.label).foregroundColor(money.tone.color))
                .font(.sans(13))
                .foregroundStyle(Palette.tx2)
                .lineLimit(2)
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
        var s = entry.type.isEmpty ? String(localized: "Transport") : TransportIcon.name(entry.type)
        if let d = entry.date { s += " · \(Days.short(d))" }
        if let t = entry.time, !t.isEmpty { s += " \(t)" }
        return s
    }

    private var detail: String {
        var s = leg == nil ? "\(entry.from) → \(entry.to) · " : ""
        if let via = entry.via, !via.isEmpty {
            s += String(localized: "via \(via)")
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

    /// The type as it reads: the four known ones in the app's language, the
    /// rest as typed, capitalised. The English name is what's saved.
    static func name(_ type: String) -> String {
        switch type.lowercased() {
        case "flight": String(localized: "Flight")
        case "train": String(localized: "Train")
        case "bus": String(localized: "Bus")
        case "ferry": String(localized: "Ferry")
        case "other": String(localized: "Other")
        default: type.prefix(1).uppercased() + type.dropFirst()
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
    @Environment(TripStore.self) private var store
    @Environment(TripEditor.self) private var editor
    @State private var confirmDelete = false

    var body: some View {
        let current = !maybe && Journey.isCurrent(seg, today: today)
        HStack(alignment: .top, spacing: 12) {
            Rail(line: .solid, node: maybe ? .maybe : current ? .current : .stop, nodeTop: 36)
            StopCard(seg: seg, maybe: maybe, current: current, state: state, today: today)
                .modifier(ZoomSource(id: Route.stop(seg.id), namespace: zoom))
                .modifier(EditMenu(enabled: store.canEdit) { menu })
                .padding(.vertical, 6)
        }
        .settlesOnScroll()
        .confirmationDialog(seg.city.isEmpty ? Text("Delete this stop?") : Text("Delete \(seg.city)?"), isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { quick { $0.remove("segments", id: seg.id) } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Its stays and transport stay on the trip; the legs on either side become one.")
        }
    }

    /// Quick jumps into the same sheets the stop page opens (mock, 27 Sep).
    @ViewBuilder private var menu: some View {
        Button("Edit stop", systemImage: "pencil") { editor.open(.stop(seg)) }
        Button("Add stay", systemImage: "bed.double") {
            let cov = Journey.coverage(seg, state.stays.filter { $0.segId == seg.id })
            editor.open(.stay(nil, seg: seg, range: cov.covered.isEmpty ? nil : cov.gaps.first))
        }
        if !maybe, let leg = Journey.timeline(state).legs.first(where: { $0.from.seg?.id == seg.id }) {
            let open = { editor.open(.transport(nil, from: leg.from.city, to: leg.to.city, date: leg.date)) }
            if leg.wayHome {
                Button("Add transport home", systemImage: "airplane", action: open)
            } else {
                Button("Add transport to \(leg.to.city)", systemImage: "airplane", action: open)
            }
        }
        let togglePlan = {
            let include = !seg.inPlan
            quick { $0.upsert("segments", id: seg.id, ["include": .bool(include)]) }
        }
        if seg.inPlan {
            Button("Leave out of the plan", systemImage: "circle.dashed", action: togglePlan)
        } else {
            Button("Put in the plan", systemImage: "checkmark.circle", action: togglePlan)
        }
        Divider()
        if seg.city.isEmpty {
            Button("Delete stop", systemImage: "trash", role: .destructive) { confirmDelete = true }
        } else {
            Button("Delete \(seg.city)", systemImage: "trash", role: .destructive) { confirmDelete = true }
        }
    }

    /// Saves a one-tap edit; if it can't, the timeline says why. Offline the save
    /// waits for a connection, so say so meanwhile instead of looking done.
    private func quick(_ change: @escaping (inout JSONValue) -> Void) {
        Task {
            let waiting = String(localized: "Will save when you’re back online.")
            if !Connectivity.shared.isOnline { store.saveNotice = waiting }
            do {
                try await store.save(change)
                if store.saveNotice == waiting { store.saveNotice = nil }
            }
            catch is CancellationError { if store.saveNotice == waiting { store.saveNotice = nil } }
            catch { store.saveNotice = error.localizedDescription }
        }
    }
}

/// The long-press menu, only for an editor: a viewer's long-press would lift the
/// card with nothing under it.
private struct EditMenu<Menu: View>: ViewModifier {
    let enabled: Bool
    @ViewBuilder let menu: () -> Menu

    func body(content: Content) -> some View {
        if enabled {
            content.contextMenu { menu() }
        } else {
            content
        }
    }
}

private extension Segment {
    /// Neither date set yet.
    var undated: Bool { arrive.isEmpty && depart.isEmpty }
    /// "0 nights" says nothing while a date is still missing.
    func hidesNights(_ nights: Int) -> Bool { nights == 0 && (arrive.isEmpty || depart.isEmpty) }
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
                    Text(seg.city.isEmpty ? String(localized: "Stop") : seg.city)
                        .font(.serif(21))
                        .foregroundStyle(Palette.tx)
                        .lineLimit(1)
                    // City, country and dates a row each (Patrik, 29 Sep): side by side they
                    // ran out of room in Hungarian and with longer names.
                    if !seg.country.isEmpty {
                        Text(L10n.country(seg.country))
                            .font(.sans(15))
                            .foregroundStyle(Palette.tx2)
                            .lineLimit(1)
                    }
                    // Undated, it said "— → —" and "0 nights": say it plainly instead.
                    (seg.undated ? Text("No dates yet") : Text(verbatim: "\(Days.short(seg.arrive)) → \(Days.short(seg.depart))"))
                        .font(.sans(15))
                        .foregroundStyle(Palette.tx2)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                if !seg.hidesNights(nights) {
                    VStack(alignment: .trailing, spacing: 0) {
                        Text("\(nights)").font(.sans(19, weight: .semibold)).foregroundStyle(Palette.tx)
                        (nights == 1 ? Text("night") : Text("nights"))
                            .font(.sans(13)).textCase(.uppercase).tracking(1).foregroundStyle(Palette.tx2)
                    }
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

/// A stop's stays and its warnings. Shared by the card and the stop screen: the
/// card keeps it short (name, nights, price); the stop screen adds how each stay
/// is paid. Lines sit only between rows, never above the first or under the last.
struct StayList: View {
    let seg: Segment
    let stays: [Stay]
    let inPlan: Bool
    let state: TripState
    let today: String
    /// The stop screen's version, with the payment line under each stay.
    var detailed = false

    private enum Item: Hashable {
        case stay(Stay, Journey.NightRange)
        case old(Stay)
        case gap(Journey.NightRange)
        case overlap(Journey.NightRange)
        case none
    }

    private var items: [Item] {
        let cov = Journey.coverage(seg, stays)
        var out: [Item] = cov.covered.map { .stay($0.stay, $0.range) }
        out += stays.filter { $0.include != true }.map { .old($0) }
        if inPlan { out += cov.gaps.map { .gap($0) } }
        out += cov.overlaps.map { .overlap($0) }
        if stays.isEmpty { out.append(.none) }
        return out
    }

    @Environment(TripStore.self) private var store

    var body: some View {
        let items = items
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element) { i, item in
                if i > 0 { Divider().overlay(Palette.ln) }
                // On the stop page every row opens what it's about; on the
                // timeline the whole card opens the stop instead.
                if detailed, let target = target(item) {
                    EditTap(target: target) { view(item).padding(.vertical, 10) }
                } else {
                    view(item).padding(.vertical, 10)
                }
            }
            if detailed, store.canEdit, !stays.isEmpty {
                Divider().overlay(Palette.ln)
                EditTap(target: .stay(nil, seg: seg, range: addRange)) {
                    Label("Add stay", systemImage: "plus")
                        .font(.sans(16, weight: .semibold))
                        .foregroundStyle(Palette.ac)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                }
            }
        }
    }

    /// Web: the first gap once the stop has stays, else the stop's own dates.
    private var addRange: Journey.NightRange? {
        let cov = Journey.coverage(seg, stays)
        return cov.covered.isEmpty ? nil : cov.gaps.first
    }

    private func target(_ item: Item) -> EditTarget? {
        switch item {
        case .stay(let stay, _), .old(let stay): .stay(stay, seg: seg, range: nil)
        case .gap(let g): .stay(nil, seg: seg, range: g)
        case .none: .stay(nil, seg: seg, range: nil)
        case .overlap: nil
        }
    }

    @ViewBuilder private func view(_ item: Item) -> some View {
        switch item {
        case .stay(let stay, let range):
            let total = Journey.toBase(Journey.stayTotal(stay, seg), stay.cur, state.rates)
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(Journey.stayName(stay, in: seg))
                        .font(.sans(16, weight: .medium)).foregroundStyle(Palette.tx).lineLimit(1)
                    // Two lines: in Hungarian one cut the nights count.
                    Text("\(Days.short(range.from)) – \(Days.short(range.to)) · \(range.nights) nights")
                        .font(.sans(13)).foregroundStyle(Palette.tx2).lineLimit(2)
                    if detailed {
                        let money = Journey.stayMoney(stay, today: today)
                        Text(money.label.prefix(1).uppercased() + money.label.dropFirst())
                            .font(.sans(13, weight: .medium)).foregroundStyle(money.tone.color)
                    }
                }
                Spacer(minLength: 8)
                if total > 0 {
                    Text(Journey.money(total, state.meta.baseCurrency))
                        .font(.sans(16, weight: .semibold)).monospacedDigit().foregroundStyle(Palette.tx)
                }
                if detailed, store.canEdit {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.tx3)
                }
            }
        case .old(let stay):
            VStack(alignment: .leading, spacing: 2) {
                Text(Journey.stayName(stay, in: seg))
                    .font(.sans(16, weight: .medium)).foregroundStyle(Palette.tx).lineLimit(1)
                Text("old option · not counted").font(.sans(13)).foregroundStyle(Palette.tx2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .opacity(0.55)
        case .gap(let g):
            HStack {
                Text("No bed \(Days.short(g.from)) → \(Days.short(g.to))").font(.sans(16, weight: .medium))
                Spacer()
                Text("\(g.nights) nights").font(.sans(13))
            }
            .foregroundStyle(Palette.warn)
        case .overlap(let o):
            Text("Two stays overlap \(Days.short(o.from)) – \(Days.short(o.to)) · \(o.nights) nights counted twice")
                .font(.sans(13, weight: .medium)).foregroundStyle(Palette.warn)
        case .none:
            (inPlan ? Text("No stay yet") : Text("Nights not counted"))
                .font(.sans(16, weight: .medium))
                .foregroundStyle(inPlan ? Palette.warn : Palette.tx3)
        }
    }
}

// MARK: - a stop, opened

/// A stop opens as a place: a landscape header with the name large over it, so the
/// card visibly grows into a scene (2026-09-27). The wash stands in for a photo.
struct StopScreen: View {
    let segmentId: String
    @Environment(TripStore.self) private var store
    @Environment(TabRouter.self) private var router

    var body: some View {
        if let state = store.trip?.state, let seg = state.segments.first(where: { $0.id == segmentId }) {
            StopPage(seg: seg, state: state)
        } else {
            Text("This stop is no longer on the journey.")
                .font(.sans(16)).foregroundStyle(Palette.tx2)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Palette.canvas.ignoresSafeArea())
                .task {
                    // Deleted (here or on the web): go back to the timeline.
                    try? await Task.sleep(for: .milliseconds(400))
                    if router.paths[.trip]?.last == .stop(segmentId) { router.paths[.trip]?.removeLast() }
                }
        }
    }
}

private struct StopPage: View {
    let seg: Segment
    let state: TripState
    private var today: String { Days.today() }
    @Environment(TripStore.self) private var store
    @Environment(TripEditor.self) private var editor

    var body: some View {
        let tl = Journey.timeline(state)
        let onward = Journey.onward(state, tl)
        let arriving = tl.legs.first { $0.to.seg?.id == seg.id }
        let leaving = tl.legs.first { $0.from.seg?.id == seg.id }
        let current = Journey.isCurrent(seg, today: today)
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                hero(current: current)
                VStack(alignment: .leading, spacing: 16) {
                    section("Stays") {
                        StayList(seg: seg, stays: state.stays.filter { $0.segId == seg.id }, inPlan: seg.inPlan, state: state, today: today, detailed: true)
                            .padding(.horizontal, 18)
                            .padding(.vertical, 4)
                            .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
                    }
                    if let arriving { legSection("Getting here", arriving, onward: onward) }
                    if let leaving {
                        legSection(leaving.wayHome ? (onward ? "Onward" : "Going home") : "Leaving for \(leaving.to.city)", leaving, onward: onward)
                    }
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
        .toolbar {
            if store.canEdit {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Edit") { editor.open(.stop(seg)) }.fontWeight(.semibold)
                }
            }
        }
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
                Text(seg.city.isEmpty ? String(localized: "Stop") : seg.city)
                    .font(.serif(44, weight: .medium, relativeTo: .largeTitle))
                    .foregroundStyle(Palette.tx)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                if !seg.country.isEmpty {
                    Text(L10n.country(seg.country))
                        .font(.sans(16, weight: .medium))
                        .foregroundStyle(Palette.tx2)
                }
                Group {
                    if seg.undated {
                        Text("No dates yet")
                    } else if seg.hidesNights(nights) {
                        Text(verbatim: "\(Days.short(seg.arrive)) → \(Days.short(seg.depart))")
                    } else {
                        Text(verbatim: "\(Days.short(seg.arrive)) → \(Days.short(seg.depart)) · " + String(localized: "\(nights) nights"))
                    }
                }
                .font(.sans(16, weight: .medium))
                .foregroundStyle(Palette.tx2)
                if !seg.inPlan {
                    // A maybe opened from the timeline, where it's only faded.
                    Text("Maybe · not in the plan")
                        .font(.sans(15))
                        .foregroundStyle(Palette.tx2)
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 12)
        }
        .frame(height: 340)
    }

    private func section<C: View>(_ title: LocalizedStringKey, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            CardLabel(title, mauve: true)
            content()
        }
    }

    private func legSection(_ title: LocalizedStringKey, _ leg: Journey.Leg, onward: Bool) -> some View {
        section(title) {
            LegEntries(leg: leg, state: state, today: today, onward: onward)
        }
    }
}

// MARK: - trip settings (read-only)
