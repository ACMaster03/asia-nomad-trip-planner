import SwiftUI

// Trip with the globe on top (#166; Patrik, 10 Oct, mock "The globe behind Trip",
// round 3): the globe fills the top of Trip and the timeline scrolls up over it.
// In that header the globe only takes a tap, which opens it full screen; there it
// turns and zooms, with two round buttons (World, Replay) and a card at the bottom
// that brings the timeline back. Replays play with the globe open, and the timeline
// rises again while the globe settles.
//
// One frame, two journeys: `GlobeScaffold` is the globe, the header, the timeline
// sheet and the moves; your own Trip (`TripWithGlobe`) and a journey you follow
// (Follow/FollowedTripScreen.swift) fill it in.

/// The whole-journey replay after onboarding: once per journey, on this phone.
enum GlobeIntro {
    private static func key(_ tripId: String) -> String { "globe.intro.\(tripId)" }

    static func markPending(tripId: String) { UserDefaults.standard.set("pending", forKey: key(tripId)) }
    static func isPending(tripId: String) -> Bool { UserDefaults.standard.string(forKey: key(tripId)) == "pending" }
    static func markPlayed(tripId: String) { UserDefaults.standard.set("played", forKey: key(tripId)) }
}

/// What a screen asks its globe to do; the scaffold does it and clears the request.
enum GlobePlay: Equatable {
    /// The whole journey, leg by leg.
    case journey
    /// One leg, into a stop just arrived in.
    case arrival(leg: Int)
    /// Open on one stop and stay there (a check-in from the feed).
    case focus(stop: Int)
}

struct TripWithGlobe: View {
    let trip: TripRow
    /// Opens the new-journey form.
    let planNext: () -> Void

    @Environment(TripStore.self) private var store
    @Environment(TabRouter.self) private var router
    @State private var play: GlobePlay?
    private let places = GlobePlaces.shared
    private var today: String { Days.today() }

    var body: some View {
        let journey = GlobeJourney(state: trip.state, today: today, places: places)
        GlobeScaffold(
            journey: journey,
            title: trip.name ?? trip.state.meta.tripName ?? String(localized: "Your journey"),
            tab: .trip,
            play: $play,
            refresh: { await store.refresh() },
            header: { open in TripHeader(trip: trip, today: today, showsGear: !open, onGlobe: true) },
            timeline: { TripTimeline(trip: trip, planNext: planNext, showsHeader: false) },
            peek: { _ in peek }
        )
        .onChange(of: router.globeRequest, initial: true) { handleRequest(journey) }
        .onChange(of: router.selection) { maybeIntro(journey) }
        .onChange(of: journey, initial: true) { _, j in maybeIntro(j) }
        .task(id: trip.state.segments.map(\.city).joined(separator: "|") + (trip.state.meta.homeBase ?? "")) {
            await places.resolve(GlobeJourney.wanted(trip.state))
        }
    }

    private var peek: some View {
        let state = trip.state
        let cur = Journey.current(in: state, today: today)
        let next = state.segments.filter(\.inPlan).sorted { $0.arrive < $1.arrive }.first { $0.arrive > today }
        var lines: [String] = []
        if let cur {
            let p = Journey.progress(cur, today: today)
            lines.append(String(localized: "Night \(p.night) of \(p.nights)"))
        }
        if let next { lines.append(String(localized: "\(next.city) next, \(Days.short(next.arrive))")) }
        return GlobePeekText(title: cur?.city ?? next?.city ?? (trip.name ?? state.meta.tripName ?? ""),
                             line: lines.joined(separator: " · "))
    }

    private func handleRequest(_ j: GlobeJourney) {
        guard case .arrival(let city) = router.globeRequest else { return }
        router.globeRequest = nil
        guard let leg = j.legs.lastIndex(where: { Journey.sameCity(j.stops[$0.to].name, city) }) else { return }
        play = .arrival(leg: leg)
    }

    /// The whole journey, once, the first time Trip shows a route after the new-journey form.
    private func maybeIntro(_ j: GlobeJourney) {
        guard router.selection == .trip, store.canEdit, GlobeIntro.isPending(tripId: trip.id),
              !j.legs.isEmpty, play == nil else { return }
        GlobeIntro.markPlayed(tripId: trip.id)
        play = .journey
    }
}

/// The peek card's words: the stop, and one line under it.
struct GlobePeekText: View {
    var kicker: String? = nil
    let title: String
    var line: String = ""
    var quote: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let kicker {
                Text(verbatim: kicker)
                    .font(.sans(11, weight: .semibold)).textCase(.uppercase).tracking(0.8)
                    .foregroundStyle(Palette.ac2)
            }
            Text(verbatim: title).font(.serif(19)).foregroundStyle(Palette.tx)
            if !line.isEmpty {
                Text(verbatim: line).font(.sans(13)).foregroundStyle(Palette.tx2)
            }
            if let quote, !quote.isEmpty {
                Text(verbatim: "“\(quote)”").font(.sans(13)).foregroundStyle(Palette.tx2).lineLimit(2)
            }
        }
    }
}

/// The globe in the header, the timeline over it, and the open globe.
struct GlobeScaffold<Header: View, Timeline: View, Peek: View>: View {
    let journey: GlobeJourney
    /// The compact bar's name, once the timeline covers the globe.
    let title: String
    /// Re-tapping this tab scrolls back up to the globe.
    let tab: AppTab
    @Binding var play: GlobePlay?
    let refresh: () async -> Void
    /// Over the globe, closed (`false`) and open (`true`).
    @ViewBuilder let header: (_ open: Bool) -> Header
    @ViewBuilder let timeline: () -> Timeline
    /// The open globe's card; given the stop it was opened on, if any.
    @ViewBuilder let peek: (_ focused: Int?) -> Peek

    @Environment(TabRouter.self) private var router
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var globe = GlobeModel(journey: GlobeJourney(stops: [], legs: [], countries: [], homeCountry: nil))
    @State private var open = false
    @State private var playing = false
    @State private var world = false
    @State private var focused: Int?
    @State private var scrollY: CGFloat = 0
    /// Where the globe's centre sits in the header, as a share of the screen's height.
    @State private var cyHeader = 0.235
    @State private var scrollProxy: ScrollViewProxy?

    private static var cyOpen: Double { 0.40 }

    var body: some View {
        GeometryReader { geo in
            let full = geo.size.height + geo.safeAreaInsets.top + geo.safeAreaInsets.bottom
            let header = max(240, geo.size.height * 0.40)
            ScrollViewReader { proxy in
                ZStack(alignment: .top) {
                    Palette.canvas.ignoresSafeArea()
                    globeLayer(header: header)
                    timelineLayer(header: header, full: full, proxy: proxy)
                    compactBar(visible: !open && scrollY > header - 70, proxy: proxy)
                    if open { openOverlay(proxy: proxy) }
                }
                .onChange(of: router.scrollToTop[tab]) {
                    if open { close() }
                    withAnimation(Motion.settle) { proxy.scrollTo("globe-top", anchor: .top) }
                }
                .onChange(of: journey, initial: true) { _, j in sync(j) }
                .onChange(of: play, initial: true) { run(proxy) }
                .onChange(of: header, initial: true) {
                    // The header's middle, a little low: the route sits under the title.
                    cyHeader = Double((geo.safeAreaInsets.top + header * 0.55) / max(1, full))
                    if !open && !globe.isAnimating { globe.camera.cy = cyHeader }
                }
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .onDisappear { globe.finish() }
    }

    // MARK: layers

    private func globeLayer(header: CGFloat) -> some View {
        let y = max(0, scrollY)
        return GlobeView(model: globe, interactive: open && !playing, paused: !open && y > header - 20) { i in
            guard let id = globe.journey.stops[i].id else { return }
            close()
            Task {
                try? await Task.sleep(for: .milliseconds(450))
                withAnimation(Motion.settle) { scrollProxy?.scrollTo("stop-" + id, anchor: .center) }
            }
        }
        .ignoresSafeArea()
        .offset(y: open ? 0 : -y * 0.5)
        .opacity(open ? 1 : 1 - Double(min(1, y / 320)) * 0.75)
        .allowsHitTesting(open)
        .accessibilityHidden(!open)
    }

    private func timelineLayer(header: CGFloat, full: CGFloat, proxy: ScrollViewProxy) -> some View {
        ScrollView {
            VStack(spacing: 0) {
                // The header: the journey's name over the globe, and the whole of it a tap
                // target that opens the globe. A drag here scrolls the timeline.
                ZStack(alignment: .top) {
                    Color.clear
                    self.header(false)
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                    openPill
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                        .padding(.trailing, 14)
                        .padding(.bottom, 30)
                }
                .frame(height: header)
                .contentShape(Rectangle())
                .onTapGesture { openGlobe(proxy) }
                .accessibilityAddTraits(.isButton)
                .accessibilityHint(Text("Opens the globe"))
                .id("globe-top")
                .onGeometryChange(for: CGFloat.self) { -$0.frame(in: .scrollView).minY } action: { scrollY = $0 }

                VStack(alignment: .leading, spacing: 0) {
                    timeline()
                }
                .padding(.horizontal, 16)
                .padding(.top, 18)
                .padding(.bottom, 24)
                .frame(maxWidth: .infinity, minHeight: full * 0.62, alignment: .top)
                .background {
                    UnevenRoundedRectangle(topLeadingRadius: 24, topTrailingRadius: 24)
                        .fill(Palette.canvas)
                        .shadow(color: .black.opacity(0.08), radius: 14, y: -6)
                        .ignoresSafeArea(edges: .bottom)
                }
            }
        }
        .scrollIndicators(.hidden)
        .refreshable {
            guard Connectivity.shared.isOnline else { return }
            await refresh()
        }
        .offset(y: open ? full : 0)
        .allowsHitTesting(!open)
        .accessibilityHidden(open)
        .onAppear { scrollProxy = proxy }
    }

    private var openPill: some View {
        Label("Open the globe", systemImage: "arrow.up.left.and.arrow.down.right")
            .font(.sans(13, weight: .medium))
            .foregroundStyle(Palette.tx2)
            .padding(.horizontal, 11)
            .padding(.vertical, 6)
            .background(.ultraThinMaterial, in: .capsule)
            .overlay(Capsule().strokeBorder(Palette.ln, lineWidth: 1))
    }

    /// Once the timeline covers the globe: the name, and a way back to the globe.
    private func compactBar(visible: Bool, proxy: ScrollViewProxy) -> some View {
        HStack {
            Text(verbatim: title)
                .font(.serif(17))
                .foregroundStyle(Palette.tx)
                .lineLimit(1)
            Spacer()
            Button { openGlobe(proxy) } label: {
                Label("Globe", systemImage: "globe")
                    .font(.sans(13, weight: .medium))
                    .foregroundStyle(Palette.tx2)
                    .padding(.horizontal, 11)
                    .padding(.vertical, 6)
                    .background(Palette.sf, in: .capsule)
                    .overlay(Capsule().strokeBorder(Palette.ln, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial)
        .overlay(alignment: .bottom) { Rectangle().fill(Palette.ln).frame(height: 1) }
        .opacity(visible ? 1 : 0)
        .allowsHitTesting(visible)
        .animation(Motion.quick, value: visible)
    }

    /// The open globe: the name top left, World and Replay top right, the card at the bottom.
    private func openOverlay(proxy: ScrollViewProxy) -> some View {
        VStack(spacing: 0) {
            HStack(alignment: .top) {
                header(true)
                Spacer(minLength: 12)
                VStack(spacing: 10) {
                    RoundGlobeButton(symbol: world ? "point.topleft.down.to.point.bottomright.curvepath" : "globe",
                                     label: world ? "Show the journey" : "Show the world") {
                        world.toggle()
                        focused = nil
                        world ? globe.goWorld() : globe.goJourney()
                    }
                    RoundGlobeButton(symbol: "airplane", label: "Replay the journey", tint: Palette.ac2Deep) {
                        world = false
                        focused = nil
                        globe.replayJourney()
                    }
                    .disabled(globe.journey.legs.isEmpty)
                }
                .disabled(playing)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            Spacer()
            Button { close() } label: { peekCard }
                .buttonStyle(.plain)
                .padding(.horizontal, 12)
                .padding(.bottom, 10)
                .disabled(playing)
        }
        .transition(.opacity)
    }

    private var peekCard: some View {
        HStack(alignment: .center, spacing: 10) {
            peek(focused)
            Spacer()
            HStack(spacing: 4) {
                Text("Timeline")
                Image(systemName: "chevron.up").font(.system(size: 12, weight: .semibold))
            }
            .font(.sans(13, weight: .medium))
            .foregroundStyle(Palette.ac)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
        .shadow(color: .black.opacity(0.1), radius: 16, y: 6)
        .accessibilityElement(children: .combine)
        .accessibilityHint(Text("Back to the timeline"))
    }

    // MARK: moves

    private func sync(_ j: GlobeJourney) {
        let first = globe.journey.stops.isEmpty
        globe.update(j, reframe: !open && !playing)
        if first, !open { globe.camera = GlobeModel.journeyCamera(j, cy: cyHeader) }
    }

    private func openGlobe(_ proxy: ScrollViewProxy, duration: TimeInterval = 0.65) {
        guard !open else { return }
        proxy.scrollTo("globe-top", anchor: .top)
        world = false
        withAnimation(Motion.settle) { open = true }
        globe.goJourney(cy: Self.cyOpen, duration: duration)
    }

    private func close() {
        guard open else { return }
        world = false
        focused = nil
        withAnimation(Motion.settle) { open = false }
        globe.goJourney(cy: cyHeader, duration: 0.65)
    }

    /// Does what the screen asked for, once.
    private func run(_ proxy: ScrollViewProxy) {
        guard let request = play else { return }
        play = nil
        sync(journey)
        switch request {
        case .journey:
            replay(proxy) { cy in globe.replayJourney(settleCy: cy) }
        case .arrival(let leg):
            guard globe.journey.legs.indices.contains(leg) else { return }
            replay(proxy) { cy in globe.replayArrival(leg: leg, settleCy: cy) }
        case .focus(let stop):
            guard !playing else { return }
            world = false
            proxy.scrollTo("globe-top", anchor: .top)
            withAnimation(Motion.settle) { open = true }
            focused = stop
            globe.goStop(stop, cy: Self.cyOpen)
        }
    }

    /// A replay after onboarding or after an arrival: open, play, and as the globe settles
    /// back on the whole journey the timeline rises again (round 3).
    private func replay(_ proxy: ScrollViewProxy, _ run: @escaping (Double) -> GlobeModel.Playback) {
        guard !playing else { return }
        playing = true
        let wasOpen = open
        openGlobe(proxy)
        Task {
            if !wasOpen { try? await Task.sleep(for: .milliseconds(reduceMotion ? 0 : 700)) }
            let pb = run(cyHeader)
            try? await Task.sleep(for: .seconds(pb.settleStart))
            world = false
            focused = nil
            withAnimation(.smooth(duration: 0.55)) { open = false }
            try? await Task.sleep(for: .seconds(max(0, pb.duration - pb.settleStart)))
            if !globe.isAnimating, abs(globe.camera.cy - cyHeader) > 0.005 { globe.goJourney(cy: cyHeader, duration: 0.4) }
            playing = false
        }
    }
}

/// A round glass button on the open globe (round 3: World and Replay, from mock B).
private struct RoundGlobeButton: View {
    let symbol: String
    let label: LocalizedStringKey
    var tint: Color = Palette.tx2
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(tint)
                .frame(width: 44, height: 44)
                .background { surface }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(label))
    }

    @ViewBuilder private var surface: some View {
        if #available(iOS 26, *) {
            Circle().fill(.clear).glassEffect(.regular, in: .circle)
        } else {
            Circle().fill(.ultraThinMaterial)
                .overlay(Circle().strokeBorder(Palette.ln, lineWidth: 1))
                .shadow(color: .black.opacity(0.1), radius: 8, y: 3)
        }
    }
}
