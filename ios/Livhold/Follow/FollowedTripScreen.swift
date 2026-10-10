import SwiftUI

// A journey you follow, opened as your own Trip is (#166; Patrik, 10 Oct, mock "Following
// a journey", A): the globe on top, the timeline under it. Without the parts that are
// the travellers' alone: no gear, prices, stays or "+ Add". Their check-ins sit under
// each stop, the latest open and the rest folded. "…" holds Mute.
//
// Opened from Home: a journey's card, or one post in the feed. A check-in opens the
// globe on its stop with the check-in on the card; an arrival plays its leg. A new
// arrival also plays on the next look, once per phone.

struct FollowedTripScreen: View {
    let tripId: String
    /// The post it was opened from, if any.
    var focus: String?

    @Environment(FollowStore.self) private var follows
    @Environment(\.dismiss) private var dismiss
    @State private var play: GlobePlay?
    @State private var focusEvent: FollowedEvent?
    @State private var commentsFor: FollowedEvent?
    @State private var started = false
    @State private var toast: String?
    private let places = GlobePlaces.shared
    private var today: String { Days.today() }

    var body: some View {
        Group {
            if let j = follows.journey(tripId), !j.paused, !j.stops.isEmpty {
                let globe = GlobeJourney(followed: j, today: today, places: places)
                GlobeScaffold(
                    journey: globe,
                    title: j.name,
                    tab: .home,
                    play: $play,
                    refresh: { await follows.refresh() },
                    header: { open in header(j, open: open) },
                    timeline: { FollowedTimeline(journey: j, today: today) { commentsFor = $0 } },
                    peek: { focused in peek(j, globe: globe, focused: focused) }
                )
                .onChange(of: globe, initial: true) { _, g in start(j, g) }
                .task(id: j.stops.map(\.city).joined(separator: "|")) {
                    await places.resolve(GlobeJourney.wanted(j))
                }
            } else {
                unavailable
            }
        }
        .sheet(item: $commentsFor) { e in
            CommentsSheet(event: e).environment(follows)
        }
        .toast($toast)
    }

    // MARK: header

    private func header(_ j: FollowedJourney, open: Bool) -> some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                if !open {
                    Button { dismiss() } label: {
                        HStack(spacing: 3) {
                            Image(systemName: "chevron.left").font(.system(size: 14, weight: .semibold))
                            Text("Home")
                        }
                        .font(.sans(15, weight: .medium))
                        .foregroundStyle(Palette.ac)
                        .frame(minHeight: 32)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .padding(.bottom, 2)
                }
                Text(verbatim: kicker(j))
                    .font(.sans(13, weight: .medium))
                    .textCase(.uppercase)
                    .tracking(1.2)
                    .foregroundStyle(Palette.ac2)
                Text(verbatim: j.name.isEmpty ? String(localized: "Their journey") : j.name)
                    .font(.serif(28))
                    .foregroundStyle(Palette.tx)
                if !j.who.isEmpty {
                    Text(verbatim: j.who).font(.sans(15)).foregroundStyle(Palette.tx2)
                }
            }
            .shadow(color: Palette.canvas, radius: 4)
            .shadow(color: Palette.canvas.opacity(0.8), radius: 10)
            Spacer()
            if !open { more(j) }
        }
        .padding(.bottom, 12)
    }

    /// "Following · Day 41 · Hanoi"
    private func kicker(_ j: FollowedJourney) -> String {
        let meta = j.state.meta
        let rest: String
        if let start = meta.startDate, !start.isEmpty, today < start {
            rest = String(localized: "Leaves \(Days.short(start))")
        } else if let end = meta.endDate, !end.isEmpty, today > end {
            rest = String(localized: "Home again")
        } else if let day = Journey.tripDay(meta, today: today) {
            let cur = Journey.current(in: j.state, today: today)
            rest = cur.map { String(localized: "Day \(day) · \($0.city)") } ?? String(localized: "Day \(day) · between stops")
        } else {
            rest = ""
        }
        return rest.isEmpty ? String(localized: "Following") : String(localized: "Following · \(rest)")
    }

    /// Where the gear sits on your own Trip. Mute only; Unfollow belongs on the person.
    private func more(_ j: FollowedJourney) -> some View {
        let muted = follows.muted.contains(j.tripId)
        return Menu {
            Button {
                Task {
                    do {
                        try await follows.setMuted(!muted, tripId: j.tripId)
                        toast = muted ? String(localized: "Notifications on again for \(j.name)")
                                      : String(localized: "Muted. No notifications from \(j.name).")
                    } catch {
                        toast = String(localized: "Couldn’t save that. Please try again.")
                    }
                }
            } label: {
                if muted {
                    Label("Unmute this journey", systemImage: "bell")
                } else {
                    Label("Mute this journey", systemImage: "bell.slash")
                }
            }
        } label: {
            Image(systemName: "ellipsis")
        }
        .buttonStyle(.icon)
        .accessibilityLabel("More")
    }

    // MARK: the open globe's card

    @ViewBuilder private func peek(_ j: FollowedJourney, globe: GlobeJourney, focused: Int?) -> some View {
        if let focused, let e = focusEvent, let si = j.stopIndex(of: e),
           globe.stops.indices.contains(focused), globe.stops[focused].id == j.stops[si].id {
            GlobePeekText(kicker: String(localized: "\(e.authorName ?? "") checked in · \(FollowDates.when(e.at))"),
                          title: "\(e.place), \(j.stops[si].city)", quote: e.comment)
        } else {
            let cur = Journey.current(in: j.state, today: today)
            let next = j.stops.first { $0.arrive > today }
            let lines: [String] = {
                guard let cur else { return next.map { [String(localized: "\($0.city) next, \(Days.short($0.arrive))")] } ?? [] }
                let p = Journey.progress(cur, today: today)
                let i = j.stops.firstIndex(of: cur) ?? 0
                if cur.arrive == today, let arr = j.arrival(at: i), arr.day == today {
                    let how = j.leg(into: i)?.mode.flatMap(FollowedJourney.by)
                    return [how.map { String(localized: "Night \(p.night) · arrived \($0)") } ?? String(localized: "Night \(p.night) · arrived today")]
                }
                var out = [String(localized: "Night \(p.night) of \(p.nights)")]
                if let next { out.append(String(localized: "\(next.city) next, \(Days.short(next.arrive))")) }
                return out
            }()
            GlobePeekText(title: cur?.city ?? next?.city ?? j.name, line: lines.joined(separator: " · "))
        }
    }

    // MARK: what plays

    /// Once per visit: the post it was opened from, else a new arrival (once per phone,
    /// and only within a week of it: an old one isn't news).
    private func start(_ j: FollowedJourney, _ g: GlobeJourney) {
        guard !started, !g.stops.isEmpty else { return }
        started = true
        func globeStop(_ si: Int) -> Int? { g.stops.firstIndex { $0.id == j.stops[si].id } }
        func legInto(_ si: Int) -> Int? { g.legs.lastIndex { g.stops[$0.to].id == j.stops[si].id } }

        if let focus, let e = j.events.first(where: { $0.id == focus }), let si = j.stopIndex(of: e) {
            if e.isArrival, let leg = legInto(si) {
                ArrivalSeen.mark(e.id, tripId: j.tripId)
                play = .arrival(leg: leg)
            } else if let gi = globeStop(si) {
                focusEvent = e
                play = .focus(stop: gi)
            }
            return
        }
        if let arr = j.latestArrival, !ArrivalSeen.seen(arr.id, tripId: j.tripId),
           FollowDates.now.timeIntervalSince(arr.at) < 7 * 86_400,
           let si = j.stopIndex(of: arr), let leg = legInto(si) {
            ArrivalSeen.mark(arr.id, tripId: j.tripId)
            play = .arrival(leg: leg)
        }
    }

    // MARK: paused or gone

    private var unavailable: some View {
        let card = follows.cards.first { $0.trip_id == tripId }
        return VStack(alignment: .leading, spacing: 14) {
            Button { dismiss() } label: {
                Label("Home", systemImage: "chevron.left")
                    .font(.sans(15, weight: .medium))
                    .foregroundStyle(Palette.ac)
            }
            .buttonStyle(.plain)
            Text(verbatim: card?.tripName ?? String(localized: "Their journey"))
                .font(.serif(28)).foregroundStyle(Palette.tx)
            if card?.paused == true {
                Notice(text: "The travellers have paused sharing for now. It shows here again when they resume.")
            } else if follows.loaded {
                Notice(text: "Nothing to show yet: no stops are planned.")
            } else {
                TravelLoader().frame(maxWidth: .infinity).padding(.top, 60)
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.canvas.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
    }
}

// MARK: - the timeline

/// Their stops in date order, the legs between them, and the check-ins under each stop.
private struct FollowedTimeline: View {
    let journey: FollowedJourney
    let today: String
    let comment: (FollowedEvent) -> Void

    var body: some View {
        let stops = journey.stops
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(stops.enumerated()), id: \.element.id) { i, seg in
                if i > 0 { legRow(i) }
                FollowedStopRow(journey: journey, index: i, today: today, first: i == 0, last: i == stops.count - 1,
                                comment: comment)
                    .id("stop-" + seg.id)
            }
            if let end = journey.state.meta.endDate, !end.isEmpty {
                Text("Until \(Days.short(end))")
                    .font(.sans(14)).foregroundStyle(Palette.tx3)
                    .padding(.leading, 36)
                    .padding(.top, 10)
            }
        }
    }

    private func legRow(_ i: Int) -> some View {
        let a = journey.stops[i - 1], b = journey.stops[i]
        let typed = journey.leg(into: i)
        let date = typed?.date ?? b.arrive
        let done = !date.isEmpty && date <= today
        return HStack(alignment: .top, spacing: 12) {
            Rail(line: done ? .booked : .dashed)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 8) {
                    if let mode = typed?.mode, let symbol = TransportIcon.symbol(mode) {
                        Image(systemName: symbol).font(.system(size: 14, weight: .semibold))
                    }
                    Text(verbatim: [typed?.mode.map(TransportIcon.name), date.isEmpty ? nil : Days.short(date)]
                        .compactMap { $0 }.joined(separator: " · "))
                        .font(.sans(16, weight: .medium))
                }
                .foregroundStyle(Palette.ac2Deep)
                Text(verbatim: "\(a.city) → \(b.city)").font(.sans(13)).foregroundStyle(Palette.tx2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(done ? Palette.ac2Soft : .clear, in: .rect(cornerRadius: Radius.r - 6))
            .overlay {
                if !done {
                    RoundedRectangle(cornerRadius: Radius.r - 6)
                        .strokeBorder(Palette.ac2Line, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
                }
            }
            .accessibilityElement(children: .combine)
            .padding(.vertical, 6)
        }
    }
}

private struct FollowedStopRow: View {
    let journey: FollowedJourney
    let index: Int
    let today: String
    let first: Bool
    let last: Bool
    let comment: (FollowedEvent) -> Void
    @State private var unfolded = false

    var body: some View {
        let seg = journey.stops[index]
        let current = Journey.isCurrent(seg, today: today)
        let upcoming = !current && seg.arrive > today
        let checkIns = journey.checkIns(at: index)
        HStack(alignment: .top, spacing: 12) {
            Rail(line: .solid, node: current ? .current : upcoming ? .maybe : .stop,
                 clipTop: first, clipBottom: last, nodeTop: 36)
            VStack(alignment: .leading, spacing: 12) {
                top(seg, current: current, upcoming: upcoming)
                if current, Journey.nights(seg) > 0 {
                    let p = Journey.progress(seg, today: today)
                    VStack(alignment: .leading, spacing: 6) {
                        ProgressTrack(value: p.fraction)
                        Text("Night \(p.night) of \(p.nights)").font(.sans(13)).foregroundStyle(Palette.tx2)
                    }
                }
                if let arr = journey.arrival(at: index) {
                    arrived(arr)
                }
                if !checkIns.isEmpty {
                    Divider().overlay(Palette.ln)
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(unfolded ? checkIns : Array(checkIns.prefix(1))) { e in
                            CheckInItem(event: e, count: nil, comment: comment)
                        }
                        if checkIns.count > 1 {
                            Button {
                                withAnimation(Motion.settle) { unfolded.toggle() }
                            } label: {
                                Group {
                                    if unfolded {
                                        Text("Show fewer")
                                    } else {
                                        Text("\(checkIns.count - 1) more check-ins in \(seg.city)")
                                    }
                                }
                                .font(.sans(14, weight: .medium))
                                .foregroundStyle(Palette.ac)
                                .frame(minHeight: 32)
                                .contentShape(.rect)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
            .padding(.vertical, 6)
        }
    }

    private func top(_ seg: Segment, current: Bool, upcoming: Bool) -> some View {
        let nights = Journey.nights(seg)
        return VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 8) {
                Text(verbatim: seg.city).font(.serif(21)).foregroundStyle(Palette.tx).lineLimit(1)
                if current {
                    badge(Text("Now"), tint: Palette.ac, soft: Palette.acSoft)
                } else if upcoming, journey.stops.first(where: { $0.arrive > today })?.id == seg.id {
                    badge(Text("Next"), tint: Palette.ac2Deep, soft: Palette.ac2Soft)
                }
            }
            if !seg.country.isEmpty {
                Text(L10n.country(seg.country)).font(.sans(15)).foregroundStyle(Palette.tx2).lineLimit(1)
            }
            Group {
                if seg.arrive.isEmpty {
                    Text("No dates yet")
                } else if seg.depart.isEmpty {
                    Text("From \(Days.short(seg.arrive))")
                } else if nights == 1 {
                    Text(verbatim: "\(Days.short(seg.arrive)) – \(Days.short(seg.depart)) · ") + Text("1 night")
                } else {
                    Text(verbatim: "\(Days.short(seg.arrive)) – \(Days.short(seg.depart)) · ") + Text("\(nights) nights")
                }
            }
            .font(.sans(15)).foregroundStyle(Palette.tx2).lineLimit(1)
        }
    }

    private func badge(_ text: Text, tint: Color, soft: Color) -> some View {
        text.font(.sans(11, weight: .semibold)).textCase(.uppercase).tracking(0.6)
            .foregroundStyle(tint)
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .background(soft, in: .capsule)
    }

    private func arrived(_ e: FollowedEvent) -> some View {
        let how = journey.leg(into: index)?.mode.flatMap(FollowedJourney.by)
        return (Text("Arrived").fontWeight(.semibold).foregroundColor(Palette.tx)
                + Text(verbatim: " · \(Days.short(e.day))" + (how.map { " · \($0)" } ?? "")))
            .font(.sans(14)).foregroundStyle(Palette.tx2)
    }
}

// MARK: - one check-in

/// A check-in: the place, who and when, the stars, their words, and its comments.
struct CheckInItem: View {
    let event: FollowedEvent
    /// Comment count; nil reads it from the store.
    var count: Int?
    let comment: (FollowedEvent) -> Void
    @Environment(FollowStore.self) private var follows

    var body: some View {
        let n = count ?? follows.commentCounts[event.id] ?? 0
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                (Text(verbatim: event.place.isEmpty ? String(localized: "Checked in") : event.place)
                    .font(.sans(15, weight: .semibold)).foregroundColor(Palette.tx)
                 + Text(verbatim: " · \(event.authorName ?? "") · \(FollowDates.when(event.at))")
                    .font(.sans(13)).foregroundColor(Palette.tx3))
                Spacer(minLength: 4)
                if let r = event.rating, r > 0 { Stars(rating: r) }
            }
            if let words = event.comment, !words.isEmpty {
                Text(verbatim: "“\(words)”").font(.sans(15)).foregroundStyle(Palette.tx2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Button { comment(event) } label: {
                Group {
                    if n == 0 { Text("Comment") }
                    else if n == 1 { Text("1 comment · Comment") }
                    else { Text("\(n) comments · Comment") }
                }
                .font(.sans(13, weight: .medium))
                .foregroundStyle(Palette.ac)
                .frame(minHeight: 30)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
        }
    }
}

struct Stars: View {
    let rating: Int
    var body: some View {
        Text(verbatim: String(repeating: "★", count: min(5, rating)) + String(repeating: "☆", count: max(0, 5 - rating)))
            .font(.system(size: 12))
            .tracking(1)
            .foregroundStyle(Palette.warn)
            .accessibilityLabel(Text("\(rating) of 5 stars"))
    }
}

// MARK: - comments

struct CommentsSheet: View {
    let event: FollowedEvent
    @Environment(FollowStore.self) private var follows
    @State private var comments: [FollowComment] = []
    @State private var loading = true
    @State private var error: String?
    @State private var draft = ""
    @State private var sending = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(verbatim: event.place.isEmpty ? String(localized: "Comments") : event.place, size: 22)
            if let words = event.comment, !words.isEmpty {
                Text(verbatim: "“\(words)” · \(event.authorName ?? "")").font(.sans(14)).foregroundStyle(Palette.tx2)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if loading {
                        TravelLoader().frame(maxWidth: .infinity).padding(.top, 20)
                    } else if comments.isEmpty {
                        Text("No comments yet. Say something nice.").font(.sans(15)).foregroundStyle(Palette.tx3)
                    }
                    ForEach(comments) { c in row(c) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let error { Notice(verbatim: error, kind: .warn) }
            HStack(spacing: 10) {
                Field(placeholder: "Write a comment", text: $draft)
                    .submitLabel(.send)
                    .onSubmit(send)
                Button(action: send) {
                    Image(systemName: "arrow.up").font(.system(size: 17, weight: .semibold))
                }
                .buttonStyle(.icon)
                .disabled(sending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel("Send")
            }
        }
        .padding(20)
        .padding(.top, 8)
        .livholdSheet()
        .task {
            do { comments = try await follows.comments(event.id) }
            catch { self.error = AuthStore.message(for: error) ?? String(localized: "Couldn’t load the comments.") }
            loading = false
        }
    }

    private func row(_ c: FollowComment) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            if c.deleted == true {
                Text("Comment deleted").font(.sans(14)).italic().foregroundStyle(Palette.tx3)
            } else {
                HStack(spacing: 6) {
                    Text(verbatim: c.authorName ?? "").font(.sans(14, weight: .semibold)).foregroundStyle(Palette.tx)
                    if c.isTraveller == true {
                        Text("Traveller").font(.sans(11, weight: .semibold)).foregroundStyle(Palette.ac2Deep)
                            .padding(.horizontal, 6).padding(.vertical, 1)
                            .background(Palette.ac2Soft, in: .capsule)
                    }
                    if let at = FollowDates.instant(c.created_at) {
                        Text(verbatim: FollowDates.when(at)).font(.sans(12)).foregroundStyle(Palette.tx3)
                    }
                }
                Text(verbatim: c.body).font(.sans(15)).foregroundStyle(Palette.tx2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.leading, c.parent_id == nil ? 0 : 18)
    }

    private func send() {
        let text = draft
        guard !sending, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        sending = true
        error = nil
        Task {
            do {
                if let c = try await follows.addComment(text, to: event.id) { comments.append(c) }
                draft = ""
            } catch {
                self.error = AuthStore.message(for: error) ?? String(localized: "Couldn’t send the comment. Please try again.")
            }
            sending = false
        }
    }
}
