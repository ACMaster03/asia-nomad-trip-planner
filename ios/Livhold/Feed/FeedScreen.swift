import SwiftUI
import UIKit

// The Feed tab (#130; Petra, 12 and 25 Oct, mock round 2): your own side of the feed, in
// the bar's last place, where Map was. Top to bottom: who follows you, what is new since
// you last looked (who reacted, who commented, with Reply), your journey's posts by day
// with their counts, and the journeys you follow, if any. Nobody following yet: the tab
// opens on the follow link instead. The tab shows a number while something is new.

struct FeedScreen: View {
    @Environment(JourneyFeedStore.self) private var feed
    @Environment(TripStore.self) private var trips
    @Environment(FollowStore.self) private var follows
    @Environment(TabRouter.self) private var router
    @Environment(AuthStore.self) private var auth
    @State private var commentsFor: CommentsTarget?
    @State private var reactorsFor: JourneyPost?
    @State private var followersOpen = false
    @State private var toast: String?

    struct CommentsTarget: Identifiable {
        let event: FollowedEvent
        var replyTo: FollowComment.Target?
        var id: String { event.id + (replyTo?.id ?? "") }
    }

    private var today: String { Days.today() }
    private var me: String? { TripStore.fixtureWithoutSignIn ? "fixture" : auth.userId }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 10) {
                    header.id("top")
                    content
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
            .background(Palette.canvas.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .onChange(of: router.scrollToTop[.feed]) {
                withAnimation(.smooth) { proxy.scrollTo("top", anchor: .top) }
            }
        }
        .refreshable {
            guard Connectivity.shared.isOnline else { return }
            async let people: Void = follows.refresh()
            await feed.refresh()
            await people
            if router.selection == .feed { feed.opened() }
        }
        .sheet(item: $commentsFor) { t in
            CommentsSheet(event: t.event, replyTo: t.replyTo,
                          onLoaded: { feed.commentsLoaded(t.event.id, live: $0) },
                          onAdded: { feed.commentAdded(to: t.event.id) })
                .environment(follows)
        }
        .sheet(item: $reactorsFor) { p in
            ReactorsSheet(title: title(of: p)) { try await feed.reactors(p.id) }
        }
        .sheet(isPresented: $followersOpen) {
            FollowersSheet().environment(feed)
        }
        .onChange(of: feed.notice) { _, n in
            if let n { toast = n; feed.notice = nil }
        }
        .toast($toast)
    }

    // MARK: header

    private var header: some View {
        VStack(alignment: .leading, spacing: 3) {
            if let k = kicker {
                Text(verbatim: k)
                    .font(.sans(12.5, weight: .medium)).textCase(.uppercase).tracking(1.6)
                    .foregroundStyle(Palette.ac2Deep)
            }
            Text("Feed").font(.serif(28)).foregroundStyle(Palette.tx)
            if !feed.followers.isEmpty {
                Button { followersOpen = true } label: {
                    HStack(spacing: 8) {
                        HStack(spacing: -7) {
                            ForEach(feed.followers.prefix(3)) { f in
                                Avatar(name: f.name, size: 24)
                                    .overlay(Circle().strokeBorder(Palette.canvas, lineWidth: 2))
                            }
                        }
                        (Text("Followed by \(followedBy)") + Text(verbatim: " ›").foregroundColor(Palette.ac))
                            .font(.sans(14.5, weight: .medium)).foregroundStyle(Palette.tx2)
                            .lineLimit(1)
                    }
                    .frame(minHeight: 36)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.bottom, 4)
    }

    /// "Asia · day 40 · Hanoi"
    private var kicker: String? {
        guard let trip = trips.trip else { return nil }
        let state = trip.state
        var parts = [state.meta.tripName ?? trip.name ?? ""].filter { !$0.isEmpty }
        if let day = Journey.tripDay(state.meta, today: today), !Journey.isFinished(state, today: today) {
            parts.append(String(localized: "day \(day)"))
            if let cur = Journey.current(in: state, today: today) { parts.append(cur.city) }
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /// "Mum, Anna and Bence"; "Mum, Anna and 3 others".
    private var followedBy: String {
        let names = feed.followers.map(\.name)
        if names.count <= 3 { return FollowedJourney.names(names) }
        return String(localized: "\(names.prefix(2).joined(separator: ", ")) and \(names.count - 2) others")
    }

    // MARK: the page

    @ViewBuilder private var content: some View {
        if trips.trip == nil || (!feed.loaded && feed.failed) {
            if feed.failed {
                Notice(verbatim: String(localized: "Couldn’t load your posts."), kind: .warn)
                Button("Try again") { Task { await feed.refresh() } }.buttonStyle(.primary)
            }
        } else if !feed.loaded {
            TravelLoader().frame(maxWidth: .infinity).padding(.top, 120)
        } else {
            if feed.followers.isEmpty {
                FollowDoor(tripName: trips.trip?.state.meta.tripName ?? trips.trip?.name ?? "")
            }
            if !feed.shownNew.isEmpty {
                label(Text("New"))
                newBox
            }
            posts
        }
        if follows.hasAny {
            FollowingSection(today: today, tab: .feed)
                .padding(.top, 10)
        }
    }

    private func label(_ text: Text) -> some View {
        text.font(.sans(12, weight: .semibold)).textCase(.uppercase).tracking(1)
            .foregroundStyle(Palette.tx3)
            .padding(.top, 8)
    }

    // MARK: new

    private var newBox: some View {
        VStack(spacing: 0) {
            ForEach(feed.shownNew) { a in
                NewRow(activity: a, me: me) {
                    open(a, reply: false)
                } reply: {
                    open(a, reply: true)
                }
                if a.id != feed.shownNew.last?.id { Divider().overlay(Palette.ln) }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 4)
        .background(Palette.sf, in: .rect(cornerRadius: Radius.r - 2))
        .shadow(color: .black.opacity(0.05), radius: 3, y: 1)
    }

    private func open(_ a: FeedActivity, reply: Bool) {
        let post = feed.posts.first { $0.id == a.event_id }
        if !a.isComment, let post {
            reactorsFor = post
            return
        }
        let event = post?.event ?? FollowedEvent(
            id: a.event_id, kind: a.post?.kind ?? "checkin", occurred_at: a.at, author: a.post?.author,
            authorName: a.post?.authorName, payload: .init(placeName: a.post?.place), rating: nil, comment: nil,
            trip_id: trips.trip?.id ?? "", tripName: nil)
        let target = reply ? FollowComment.Target(id: a.id, thread: a.parent_id ?? a.id, name: a.name ?? "") : nil
        commentsFor = CommentsTarget(event: event, replyTo: target)
    }

    // MARK: posts

    @ViewBuilder private var posts: some View {
        label(Text("Your journey’s posts"))
        if feed.posts.isEmpty {
            Text("Nothing yet. Check in from the bar and it shows here, for you and your followers.")
                .font(.sans(14.5)).foregroundStyle(Palette.tx3)
                .padding(.vertical, 8)
        }
        ForEach(Array(days.enumerated()), id: \.element.day) { i, group in
            if i > 0 || feed.posts.count > 1 {
                DayRule(text: dayName(group.day))
            }
            ForEach(group.posts) { p in
                card(p)
            }
        }
        if feed.hasOlder {
            Button("Show older posts") { Task { await feed.loadOlder() } }
                .buttonStyle(.quiet)
                .padding(.top, 6)
        }
    }

    private func card(_ p: JourneyPost) -> some View {
        let e = p.event
        return PostCard(
            event: e, mine: p.mine, commentCount: p.commentCount ?? 0, tally: p.tally ?? [],
            onlyTravellers: p.onlyTravellers, placeLine: placeLine(p), arrivalLine: arrivalLine(p),
            authorLabel: p.author == me ? String(localized: "You") : nil,
            react: { feed.react(p.id, $0) },
            comments: { commentsFor = CommentsTarget(event: e) },
            showReactors: { reactorsFor = p })
        .settlesOnScroll()
    }

    private var days: [(day: String, posts: [JourneyPost])] {
        var out: [(day: String, posts: [JourneyPost])] = []
        for p in feed.posts {
            if out.last?.day == p.day { out[out.count - 1].posts.append(p) } else { out.append((p.day, [p])) }
        }
        return out
    }

    private func dayName(_ day: String) -> String {
        let todayOnPhone = FollowDates.day(FollowDates.now)
        if day == todayOnPhone { return String(localized: "Today") }
        if day == Days.add(todayOnPhone, -1) { return String(localized: "Yesterday") }
        return Days.weekday(day)
    }

    /// "Train Street, Hanoi": the stop whose dates hold the post's day.
    private func placeLine(_ p: JourneyPost) -> String? {
        guard p.kind == "checkin", let state = trips.trip?.state else { return nil }
        let place = p.payload?.placeName ?? ""
        guard let city = Journey.current(in: state, today: p.day)?.city, !city.isEmpty, !place.isEmpty,
              !Journey.sameCity(place, city) else { return nil }
        return "\(place), \(city)"
    }

    /// "From Bangkok": the stop before the one arrived in.
    private func arrivalLine(_ p: JourneyPost) -> String? {
        guard p.kind == "arrived", let state = trips.trip?.state else { return nil }
        let stops = state.segments.filter(\.inPlan).sorted { $0.arrive < $1.arrive }
        guard let i = stops.lastIndex(where: { Journey.sameCity($0.city, p.payload?.city) }), i > 0 else { return nil }
        return String(localized: "From \(stops[i - 1].city)")
    }

    private func title(of p: JourneyPost) -> String {
        switch p.kind {
        case "arrived": String(localized: "Arrived in \(p.payload?.city ?? "")")
        case "note": String(localized: "\(p.authorName ?? "")’s note")
        default: p.payload?.placeName ?? String(localized: "Reactions")
        }
    }
}

/// "Yesterday ———"
private struct DayRule: View {
    let text: String
    var body: some View {
        HStack(spacing: 8) {
            Text(verbatim: text).font(.sans(12, weight: .semibold)).textCase(.uppercase).tracking(0.8)
                .foregroundStyle(Palette.tx3)
            Rectangle().fill(Palette.ln).frame(height: 1)
        }
        .padding(.top, 10)
        .padding(.horizontal, 2)
    }
}

// MARK: - one row of "New"

private struct NewRow: View {
    let activity: FeedActivity
    let me: String?
    let open: () -> Void
    let reply: () -> Void

    var body: some View {
        // Two buttons side by side, not one inside the other: Reply must not open the row.
        HStack(alignment: .top, spacing: 6) {
            Button(action: open) {
                HStack(alignment: .top, spacing: 10) {
                    Avatar(name: activity.name ?? "?", size: 30)
                    VStack(alignment: .leading, spacing: 2) {
                        (Text(verbatim: activity.name ?? "").fontWeight(.semibold).foregroundColor(Palette.tx)
                         + Text(verbatim: " ") + what)
                            .font(.sans(14)).foregroundStyle(Palette.tx2)
                            .fixedSize(horizontal: false, vertical: true)
                        if activity.isComment, let body = activity.body {
                            Text(verbatim: body).font(.sans(14)).foregroundStyle(Palette.tx)
                                .lineLimit(3)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .padding(.vertical, 10)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            VStack(alignment: .trailing, spacing: 4) {
                Text(verbatim: FollowDates.when(activity.date)).font(.sans(12)).foregroundStyle(Palette.tx3)
                    .lineLimit(1)
                if activity.isComment {
                    Button(action: reply) {
                        Text("Reply").font(.sans(13, weight: .semibold)).foregroundStyle(Palette.ac)
                            .frame(minWidth: 44, minHeight: 30, alignment: .trailing)
                            .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.top, 10)
        }
    }

    /// "❤️ your Train Street", "commented on Petra’s note".
    private var what: Text {
        let post = activity.post
        let mine = post?.author != nil && post?.author == me
        let author = post?.authorName ?? ""
        let place = post?.place ?? ""
        let thing: Text
        switch (post?.kind, mine) {
        case ("note", true): thing = Text("your note")
        case ("note", false): thing = Text("\(author)’s note")
        case ("arrived", true): thing = Text("your arrival in \(place)")
        case ("arrived", false): thing = Text("\(author)’s arrival in \(place)")
        case (_, true): thing = Text("your \(Text(verbatim: place).fontWeight(.semibold).foregroundColor(Palette.tx))")
        default: thing = Text("\(author)’s \(Text(verbatim: place).fontWeight(.semibold).foregroundColor(Palette.tx))")
        }
        if activity.isComment { return Text("commented on \(thing)") }
        return Text(verbatim: "\(activity.glyph) ") + thing
    }
}

// MARK: - nobody follows yet

/// The tab's first state for most travellers: what a follow link is, and the button.
private struct FollowDoor: View {
    let tripName: String
    @Environment(JourneyFeedStore.self) private var feed
    @State private var link: URL?
    @State private var working = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(tripName.isEmpty ? String(localized: "Nobody follows you yet") : String(localized: "Nobody follows \(tripName) yet"))
                .font(.serif(21)).foregroundStyle(Palette.tx)
            Text("Send your family the follow link. They see your stops and dates, how you travel, and your check-ins with their photos. Never what you spend, where you stay or your bookings.")
                .font(.sans(14.5)).foregroundStyle(Palette.tx2)
                .fixedSize(horizontal: false, vertical: true)
            SendLinkButton(link: $link, working: $working, error: $error)
            Text("Anyone with the link can watch. To leave a heart or a comment, they sign in.")
                .font(.sans(12.5)).foregroundStyle(Palette.tx3)
            if let error { Notice(verbatim: error, kind: .warn) }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
        .shadow(color: .black.opacity(0.05), radius: 3, y: 1)
    }
}

/// "Send the follow link": makes a new link (the web's Account → Create follow link)
/// and opens the share sheet on it.
private struct SendLinkButton: View {
    @Binding var link: URL?
    @Binding var working: Bool
    @Binding var error: String?
    @Environment(JourneyFeedStore.self) private var feed

    var body: some View {
        Button {
            guard !working else { return }
            working = true
            error = nil
            Task {
                do { link = try await feed.newFollowLink() }
                catch { self.error = AuthStore.message(for: error) ?? String(localized: "Couldn’t make a follow link. Please try again.") }
                working = false
            }
        } label: {
            if working { ProgressView().tint(Palette.on) } else { Text("Send the follow link") }
        }
        .buttonStyle(.primary)
        .sheet(item: Binding(get: { link.map(SharedLink.init) }, set: { link = $0?.url })) { s in
            ShareSheet(items: [s.url]).ignoresSafeArea().presentationDetents([.medium, .large])
        }
    }

    private struct SharedLink: Identifiable { let url: URL; var id: String { url.absoluteString } }
}

/// iOS's share sheet, for the follow link.
private struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

// MARK: - who follows you

private struct FollowersSheet: View {
    @Environment(JourneyFeedStore.self) private var feed
    @State private var link: URL?
    @State private var working = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle("Your followers", size: 22)
            Text("They follow you, so they see every journey you open to followers.")
                .font(.sans(13.5)).foregroundStyle(Palette.tx3)
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(feed.followers) { f in
                        HStack(spacing: 10) {
                            Avatar(name: f.name, size: 32)
                            Text(verbatim: f.name).font(.sans(15)).foregroundStyle(Palette.tx)
                            Spacer()
                            if let at = f.followedAt.flatMap(FollowDates.instant) {
                                Text("since \(Days.short(FollowDates.day(at)))").font(.sans(12.5)).foregroundStyle(Palette.tx3)
                            }
                        }
                        .padding(.vertical, 8)
                        if f.id != feed.followers.last?.id { Divider().overlay(Palette.ln) }
                    }
                }
            }
            if let error { Notice(verbatim: error, kind: .warn) }
            SendLinkButton(link: $link, working: $working, error: $error)
        }
        .padding(20)
        .padding(.top, 8)
        .livholdSheet()
    }
}
