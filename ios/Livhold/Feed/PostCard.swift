import SwiftUI

// One post, as the Feed and a follower's Home show it (Petra, 25 Oct: the mock's B with
// A's single reaction): the first photo large, who and when, the place and the stars,
// their words, then one reaction button and the comments. A tap on the button gives ❤️
// or takes yours back; holding it opens the six. A double tap anywhere on the post likes
// it: a heart rises where the finger was and flies into the button, which then shows it.
// Everything moves before the server answers (the stores send it optimistically).
//
// The travellers also see the counts ("❤️ 2 😮 1", a tap shows who); a follower only
// ever sees their own reaction (34).

struct PostCard: View {
    enum Style { case card, embedded }

    let event: FollowedEvent
    var mine: String?
    var commentCount: Int
    /// Travellers only: the counts per kind. Nil for a follower.
    var tally: [JourneyPost.Count]?
    var onlyTravellers = false
    var style: Style = .card
    /// "Train Street, Hanoi": the place with its stop's city, when known.
    var placeLine: String?
    /// Under an arrival: "By plane from Bangkok".
    var arrivalLine: String?
    /// "You" instead of the author's name, on your own posts.
    var authorLabel: String?
    let react: (ReactionKind?) -> Void
    let comments: () -> Void
    var showReactors: (() -> Void)?
    /// A follower's way to the journey: "Open ›" where the travellers have their counts.
    var open: (() -> Void)?

    @State private var viewer: Int?
    @State private var flight: Flight?
    /// While a heart flies: the reaction and the counts as they were, till it lands.
    @State private var shownMine: String??
    @State private var shownTally: [JourneyPost.Count]??
    @State private var landed = 0
    @State private var doubleTaps = 0
    @State private var target: CGPoint = .zero
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private struct Flight: Identifiable, Equatable {
        let id = UUID()
        let start: CGPoint
    }

    private var photos: [String] { event.isCheckIn ? (event.payload?.photos ?? []) : [] }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let first = photos.first {
                // Not a button: a tap opens the photos only once it is clear no second
                // tap follows, so a double tap on the photo likes the post.
                PostPhoto(path: first)
                    .aspectRatio(4 / 3, contentMode: .fit)
                    .frame(maxWidth: .infinity)
                    .clipped()
                    .clipShape(.rect(cornerRadius: style == .embedded ? 14 : 0))
                    .overlay(alignment: .bottomTrailing) {
                        if photos.count > 1 {
                            Text(verbatim: "1 / \(photos.count)")
                                .font(.sans(12, weight: .semibold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 9).padding(.vertical, 3)
                                .background(.black.opacity(0.5), in: .capsule)
                                .padding(10)
                        }
                    }
                    .contentShape(.rect)
                    .onTapGesture(count: 2, coordinateSpace: .named(event.id)) { at in like(at: at) }
                    .onTapGesture { viewer = 0 }
                    .accessibilityElement()
                    .accessibilityAddTraits(.isButton)
                    .accessibilityLabel(Text("Photos of \(event.place)"))
                    .accessibilityAction { viewer = 0 }
                    .padding(.bottom, style == .embedded ? 8 : 0)
            }
            VStack(alignment: .leading, spacing: 4) {
                content
                foot.padding(.top, 4)
            }
            .padding(.horizontal, style == .card ? 14 : 0)
            .padding(.vertical, style == .card ? 12 : 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            if style == .card {
                RoundedRectangle(cornerRadius: Radius.r - 2)
                    .fill(event.isArrival ? Palette.ac2Soft : Palette.sf)
                    .shadow(color: .black.opacity(event.isArrival ? 0 : 0.05), radius: 3, y: 1)
            }
        }
        .clipShape(.rect(cornerRadius: style == .card ? Radius.r - 2 : 0))
        .contentShape(.rect)
        .coordinateSpace(.named(event.id))
        .onTapGesture(count: 2, coordinateSpace: .named(event.id)) { at in like(at: at) }
        .overlay(alignment: .topLeading) {
            if let f = flight {
                FlyingHeart(start: f.start, end: target, still: reduceMotion) {
                    flight = nil
                    shownMine = nil
                    shownTally = nil
                    landed += 1
                }
                .id(f.id)
            }
        }
        .sensoryFeedback(.impact(weight: .light), trigger: doubleTaps)
        .sensoryFeedback(.impact(flexibility: .soft, intensity: 0.7), trigger: landed)
        .fullScreenCover(item: Binding(get: { viewer.map { ViewerAt(index: $0) } }, set: { viewer = $0?.index })) { at in
            PhotoViewer(event: event, photos: photos, index: at.index, placeLine: placeLine)
        }
        .accessibilityAction(named: Text("Like")) { react(.heart) }
    }

    private struct ViewerAt: Identifiable { let index: Int; var id: Int { index } }

    /// The double tap: ❤️ (replacing another reaction, never taking one back), shown on
    /// the button once the flying heart lands there.
    private func like(at point: CGPoint) {
        doubleTaps += 1
        if shownMine == nil {
            shownMine = .some(mine)
            shownTally = .some(tally)
        }
        react(.heart)
        flight = Flight(start: point)
    }

    // MARK: the words

    @ViewBuilder private var content: some View {
        if event.isArrival {
            head(Text(verbatim: " · \(FollowDates.when(event.at))"), avatar: false)
            Text("Arrived in \(event.city)").font(.serif(16.5)).foregroundStyle(Palette.ac2Deep)
            if let arrivalLine {
                Text(verbatim: arrivalLine).font(.sans(14)).foregroundStyle(Palette.tx2)
            }
        } else if event.kind == "note" {
            head(Text(verbatim: " ") + Text("wrote · \(FollowDates.when(event.at))"))
            if let text = event.payload?.text, !text.isEmpty {
                Text(verbatim: "“\(text)”").font(.serif(15.5)).italic().foregroundStyle(Palette.tx)
                    .fixedSize(horizontal: false, vertical: true)
            }
        } else {
            head(Text(verbatim: " ") + Text("checked in · \(FollowDates.when(event.at))"))
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(verbatim: placeLine ?? (event.place.isEmpty ? String(localized: "Checked in") : event.place))
                    .font(.serif(16.5)).foregroundStyle(Palette.tx)
                    .fixedSize(horizontal: false, vertical: true)
                if let r = event.rating, r > 0 { Stars(rating: r) }
            }
            if let words = event.comment, !words.isEmpty {
                Text(verbatim: "“\(words)”").font(.sans(14.5)).foregroundStyle(Palette.tx2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        if onlyTravellers {
            Label("Only the travellers see this", systemImage: "lock")
                .font(.sans(12.5)).foregroundStyle(Palette.tx3)
                .padding(.top, 2)
        }
    }

    private func head(_ rest: Text, avatar: Bool = true) -> some View {
        let who = authorLabel ?? event.authorName ?? ""
        return HStack(spacing: 7) {
            if avatar, style == .card { Avatar(name: event.authorName ?? "?", size: 22) }
            (Text(verbatim: who).fontWeight(.semibold).foregroundColor(Palette.tx) + rest)
                .font(.sans(13)).foregroundStyle(Palette.tx3)
                .lineLimit(1)
        }
    }

    // MARK: react and comment

    private var foot: some View {
        HStack(spacing: 6) {
            ReactionButton(mine: shownMine ?? mine, pop: landed, set: react)
                .onGeometryChange(for: CGPoint.self) { g in
                    let r = g.frame(in: .named(event.id))
                    return CGPoint(x: r.midX, y: r.midY)
                } action: { target = $0 }
            Button(action: comments) {
                Group {
                    if commentCount == 0 { Text("Comment") }
                    else if commentCount == 1 { Text("1 comment") }
                    else { Text("\(commentCount) comments") }
                }
                .font(.sans(13, weight: .medium))
                .foregroundStyle(Palette.ac)
                .lineLimit(1)
                .padding(.horizontal, 10)
                .frame(minHeight: 34)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            Spacer(minLength: 0)
            if let tally = shownTally ?? tally {
                TallyChip(tally: tally, open: showReactors)
            } else if let open {
                Button(action: open) {
                    HStack(spacing: 2) {
                        Text("Open")
                        Image(systemName: "chevron.right").font(.system(size: 10, weight: .semibold))
                    }
                    .font(.sans(13, weight: .medium))
                    .foregroundStyle(Palette.tx3)
                    .frame(minWidth: 44, minHeight: 34)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("Open the journey"))
            }
        }
    }
}

// MARK: - the reaction button

/// Your reaction, or an empty heart. Tap: ❤️ on, or yours off. Hold: the six.
struct ReactionButton: View {
    let mine: String?
    /// Bumped when a flying heart lands, to pop the glyph.
    var pop: Int = 0
    let set: (ReactionKind?) -> Void

    @State private var picking = false
    @State private var taps = 0

    var body: some View {
        let kind = mine.flatMap(ReactionKind.init(rawValue:))
        // Not a Button: inside a scroll view a Button swallows the hold, so the tap and the
        // hold are two gestures on one view, and it says it is a button to VoiceOver.
        Group {
            if let kind {
                Text(verbatim: kind.glyph).font(.system(size: 17))
            } else {
                Image(systemName: "heart").font(.system(size: 16, weight: .medium)).foregroundStyle(Palette.tx2)
            }
        }
        .keyframeAnimator(initialValue: 1.0, trigger: pop + taps) { view, s in
            view.scaleEffect(s)
        } keyframes: { _ in
            SpringKeyframe(1.35, duration: 0.12)
            SpringKeyframe(1.0, duration: 0.28, spring: .bouncy)
        }
        .frame(minWidth: 46, minHeight: 34)
        .background(kind != nil ? Palette.ac2Soft : .clear, in: .capsule)
        .overlay(Capsule().strokeBorder(kind != nil ? .clear : Palette.ln2, lineWidth: 1))
        .contentShape(.capsule)
        .onTapGesture {
            taps += 1
            set(kind == nil ? .heart : nil)
        }
        .onLongPressGesture(minimumDuration: 0.35) { picking = true }
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isButton)
        .accessibilityAction {
            taps += 1
            set(kind == nil ? .heart : nil)
        }
        .sensoryFeedback(.impact(weight: .light), trigger: taps)
        .sensoryFeedback(.impact(weight: .medium), trigger: picking) { _, now in now }
        .popover(isPresented: $picking, arrowEdge: .bottom) {
            picker(kind).presentationCompactAdaptation(.popover)
        }
        .accessibilityLabel(kind.map { Text("Your reaction: \($0.label)") } ?? Text("React"))
        .accessibilityHint(Text("Hold for more reactions"))
        .accessibilityActions {
            ForEach(ReactionKind.allCases) { k in
                Button(k.label) { set(k) }
            }
        }
    }

    private func picker(_ current: ReactionKind?) -> some View {
        HStack(spacing: 2) {
            ForEach(ReactionKind.allCases) { k in
                Button {
                    picking = false
                    set(current == k ? nil : k)
                } label: {
                    VStack(spacing: 2) {
                        Text(verbatim: k.glyph).font(.system(size: 26))
                        Text(verbatim: k.label).font(.sans(10, weight: .medium)).foregroundStyle(Palette.tx3)
                            .lineLimit(1).minimumScaleFactor(0.7)
                    }
                    .frame(width: 50, height: 58)
                    .background(current == k ? Palette.ac2Soft : .clear, in: .rect(cornerRadius: 12))
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text(verbatim: k.label))
            }
        }
        .padding(6)
    }
}

/// The heart a double tap throws: it springs up under the finger, holds a beat, then
/// flies into the reaction button, shrinking to the button's size as it goes.
private struct FlyingHeart: View {
    let start: CGPoint
    let end: CGPoint
    /// Reduce Motion: it appears and fades where it is, no flight.
    var still = false
    let done: () -> Void

    @State private var at: CGPoint
    @State private var scale: CGFloat = 0.2
    @State private var opacity: Double = 1

    /// `-heartPace 8` (debug) plays the flight eight times slower, to look at it.
    private static var pace: Double {
        #if DEBUG
        max(1, UserDefaults.standard.double(forKey: "heartPace"))
        #else
        1
        #endif
    }

    init(start: CGPoint, end: CGPoint, still: Bool, done: @escaping () -> Void) {
        self.start = start
        self.end = end
        self.still = still
        self.done = done
        _at = State(initialValue: start)
    }

    var body: some View {
        // The same ❤️ the button shows, so it lands as itself.
        Text(verbatim: ReactionKind.heart.glyph)
            .font(.system(size: 84))
            .shadow(color: .black.opacity(0.2), radius: 10, y: 4)
            .scaleEffect(scale)
            .opacity(opacity)
            .position(at)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .task {
                let pace = Self.pace
                withAnimation(.spring(response: 0.3 * pace, dampingFraction: 0.55)) { scale = 1 }
                try? await Task.sleep(for: .milliseconds(420 * pace))
                if still {
                    withAnimation(.easeOut(duration: 0.25)) { opacity = 0 } completion: { done() }
                } else {
                    withAnimation(.timingCurve(0.55, 0, 0.75, 0.6, duration: 0.42 * pace)) {
                        at = end
                        scale = 0.22
                    } completion: { done() }
                }
            }
    }
}

/// "❤️ 2 😮 1": the travellers' count, top three kinds. A tap shows who.
struct TallyChip: View {
    let tally: [JourneyPost.Count]
    var open: (() -> Void)?

    var body: some View {
        let top = tally.prefix(3)
        if top.isEmpty {
            Text("No reactions yet").font(.sans(12.5)).foregroundStyle(Palette.tx3)
        } else {
            Button { open?() } label: {
                HStack(spacing: 6) {
                    ForEach(Array(top), id: \.kind) { c in
                        HStack(spacing: 2) {
                            Text(verbatim: ReactionKind(rawValue: c.kind)?.glyph ?? "").font(.system(size: 13))
                            Text(verbatim: "\(c.count)").font(.sans(13, weight: .medium)).monospacedDigit()
                        }
                    }
                }
                .foregroundStyle(Palette.tx2)
                .padding(.horizontal, 10)
                .frame(minHeight: 30)
                .background(Palette.fill, in: .capsule)
                .contentShape(.capsule)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("\(tally.reduce(0) { $0 + $1.count }) reactions. See who"))
        }
    }
}

// MARK: - photos

/// A check-in's photo from the public `trip-media` bucket (the web's mediaUrl). In the
/// debug fixture, "fixture:…" paints a stand-in instead.
struct PostPhoto: View {
    let path: String
    var fit = false

    var body: some View {
        if path.hasPrefix("fixture:") {
            FixturePaint(name: String(path.dropFirst(8)))
        } else {
            AsyncImage(url: Backend.photoURL(path), transaction: Transaction(animation: Motion.settle)) { phase in
                switch phase {
                case .success(let image):
                    if fit { image.resizable().scaledToFit() } else { image.resizable().scaledToFill() }
                case .failure:
                    Palette.ph.overlay {
                        Image(systemName: "photo").font(.system(size: 24)).foregroundStyle(Palette.tx3)
                    }
                default:
                    Palette.ph
                }
            }
        }
    }
}

extension Backend {
    static func photoURL(_ path: String) -> URL? {
        URL(string: "\(current.url.absoluteString)/storage/v1/object/public/trip-media/\(path)")
    }
}

private struct FixturePaint: View {
    let name: String
    var body: some View {
        let c: [Color] = switch name {
        case "train": [Color(red: 0.56, green: 0.64, blue: 0.66), Color(red: 0.79, green: 0.71, blue: 0.56), Color(red: 0.44, green: 0.49, blue: 0.39)]
        case "train2": [Color(red: 0.24, green: 0.29, blue: 0.32), Color(red: 0.54, green: 0.43, blue: 0.31)]
        case "lit": [Color(red: 0.84, green: 0.78, blue: 0.63), Color(red: 0.71, green: 0.28, blue: 0.24), Color(red: 0.5, green: 0.56, blue: 0.36)]
        case "lake", "lake3": [Color(red: 0.91, green: 0.87, blue: 0.79), Color(red: 0.5, green: 0.61, blue: 0.52), Color(red: 0.55, green: 0.69, blue: 0.71)]
        case "lake2": [Color(red: 0.95, green: 0.79, blue: 0.6), Color(red: 0.48, green: 0.63, blue: 0.65)]
        default: [Color(red: 0.95, green: 0.88, blue: 0.72), Color(red: 0.73, green: 0.55, blue: 0.35)]
        }
        LinearGradient(colors: c, startPoint: .top, endPoint: .bottom)
            .overlay(alignment: .bottomLeading) {
                Text(verbatim: name.uppercased()).font(.sans(9.5, weight: .semibold)).tracking(0.5)
                    .foregroundStyle(.white.opacity(0.85)).padding(8)
            }
    }
}

/// The photos full screen, one at a time; swipe between them.
struct PhotoViewer: View {
    let event: FollowedEvent
    let photos: [String]
    @State var index: Int
    var placeLine: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(verbatim: "\(event.authorName ?? "") · \(FollowDates.when(event.at))")
                    .font(.sans(13, weight: .medium))
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark").font(.system(size: 15, weight: .semibold))
                        .frame(width: 36, height: 36)
                        .background(.white.opacity(0.14), in: .circle)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close")
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            TabView(selection: $index) {
                ForEach(Array(photos.enumerated()), id: \.offset) { i, p in
                    PostPhoto(path: p, fit: true)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .tag(i)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: photos.count > 1 ? .always : .never))
            VStack(alignment: .leading, spacing: 4) {
                Text(verbatim: placeLine ?? event.place).font(.serif(17))
                if let words = event.comment, !words.isEmpty {
                    Text(verbatim: "“\(words)”").font(.sans(14.5)).foregroundStyle(.white.opacity(0.75))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
        }
        .foregroundStyle(.white)
        .background(Color.black.ignoresSafeArea())
    }
}

// MARK: - who reacted

/// The travellers' list of who reacted with what (`event_reactors`).
struct ReactorsSheet: View {
    let title: String
    let load: () async throws -> [Reactor]
    @State private var list: [Reactor]?
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(verbatim: title, size: 22)
            Text("Only the travellers see who reacted.").font(.sans(13.5)).foregroundStyle(Palette.tx3)
            if let error { Notice(verbatim: error, kind: .warn) }
            ScrollView {
                VStack(spacing: 0) {
                    if list == nil && error == nil {
                        TravelLoader().frame(maxWidth: .infinity).padding(.top, 20)
                    }
                    ForEach(list ?? []) { r in
                        HStack(spacing: 10) {
                            Avatar(name: r.name, size: 32)
                            Text(verbatim: r.name).font(.sans(15)).foregroundStyle(Palette.tx)
                            Spacer()
                            Text(verbatim: ReactionKind(rawValue: r.kind)?.glyph ?? "").font(.system(size: 19))
                        }
                        .padding(.vertical, 8)
                        if r.id != list?.last?.id { Divider().overlay(Palette.ln) }
                    }
                }
            }
        }
        .padding(20)
        .padding(.top, 8)
        .livholdSheet(detents: [.medium])
        .task {
            do { list = try await load() }
            catch { self.error = AuthStore.message(for: error) ?? String(localized: "Couldn’t load who reacted.") }
        }
    }
}
