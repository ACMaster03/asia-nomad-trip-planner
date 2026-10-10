import SwiftUI

// Your people on Home (#130; Patrik, 3 Oct): one card per journey you follow (who, where,
// what's next, the latest post), then the latest posts across them. A card or a post
// opens that journey's Trip, read-only (#166). Without a journey of your own this is
// Home; with one, the cards stay, after your stop card during your journey and before
// your own journey otherwise, when theirs is under way.

struct FollowingSection: View {
    let today: String
    @Environment(FollowStore.self) private var follows

    var body: some View {
        let list = follows.journeys(today: today)
        if !list.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                SectionLabel(text: Text("Journeys you follow"))
                ForEach(list, id: \.card.trip_id) { item in
                    if item.card.paused {
                        JourneyCard(card: item.card, journey: item.journey, today: today)
                    } else {
                        NavigationLink(value: Route.followed(item.card.trip_id, nil)) {
                            JourneyCard(card: item.card, journey: item.journey, today: today)
                        }
                        .buttonStyle(.plain)
                    }
                }
                let latest = Array(follows.feed.filter { $0.isCheckIn || $0.isArrival }.prefix(8))
                if !latest.isEmpty {
                    SectionLabel(text: Text("Latest")).padding(.top, 6)
                    ForEach(latest) { e in
                        NavigationLink(value: Route.followed(e.trip_id, e.id)) {
                            FeedItem(event: e, journey: follows.journey(e.trip_id), count: follows.commentCounts[e.id] ?? 0)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }
}

private struct SectionLabel: View {
    let text: Text
    var body: some View {
        text.font(.sans(12, weight: .semibold)).textCase(.uppercase).tracking(1)
            .foregroundStyle(Palette.tx3)
            .padding(.top, 6)
    }
}

/// "Going somewhere yourself? Plan a journey": the quiet door for a follower.
struct PlanOwnRow: View {
    let plan: () -> Void
    var body: some View {
        Button(action: plan) {
            (Text("Going somewhere yourself?") + Text(verbatim: " ")
             + Text("Plan a journey").fontWeight(.semibold).foregroundColor(Palette.ac))
                .font(.sans(15))
                .foregroundStyle(Palette.tx3)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity, minHeight: 44)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .padding(.top, 8)
    }
}

private struct JourneyCard: View {
    let card: FollowedTripCard
    let journey: FollowedJourney?
    let today: String

    var body: some View {
        let travellers = journey?.travellers ?? card.travellers ?? []
        let live = !card.paused && (journey?.isLive(today: today) ?? false)
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                HStack(spacing: -8) {
                    ForEach(travellers.prefix(3), id: \.id) { t in
                        Avatar(name: t.name, size: 26)
                            .overlay(Circle().strokeBorder(Palette.sf, lineWidth: 2))
                    }
                }
                Text(verbatim: FollowedJourney.names(travellers.map(\.name)))
                    .font(.sans(14, weight: .medium)).foregroundStyle(Palette.tx2).lineLimit(1)
                Spacer(minLength: 4)
                if live {
                    Text("Live").font(.sans(11, weight: .semibold)).textCase(.uppercase).tracking(0.6)
                        .foregroundStyle(Palette.ac)
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .background(Palette.acSoft, in: .capsule)
                }
            }
            Text(verbatim: card.tripName ?? journey?.name ?? "")
                .font(.serif(22)).foregroundStyle(Palette.tx)
            if card.paused {
                Text("Sharing is paused for now").font(.sans(14)).foregroundStyle(Palette.tx3)
            } else {
                if let line = journey?.line(today: today) ?? card.currentCity, !line.isEmpty {
                    Text(verbatim: line).font(.sans(14)).foregroundStyle(Palette.tx2)
                }
                if let j = journey, let e = j.events.first(where: { $0.isCheckIn || $0.isArrival }) {
                    Divider().overlay(Palette.ln)
                    latest(e, j)
                }
                HStack(spacing: 3) {
                    Text("Open the journey")
                    Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold))
                }
                .font(.sans(14, weight: .semibold)).foregroundStyle(Palette.ac)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
        .shadow(color: .black.opacity(0.05), radius: 3, y: 1)
        .opacity(card.paused ? 0.7 : 1)
        .accessibilityElement(children: .combine)
    }

    private func latest(_ e: FollowedEvent, _ j: FollowedJourney) -> some View {
        let text: Text
        if e.isArrival {
            text = Text("Arrived in \(e.city)").fontWeight(.semibold).foregroundColor(Palette.tx)
                + Text(verbatim: " · \(FollowDates.when(e.at))")
        } else {
            let city = j.stopIndex(of: e).map { j.stops[$0].city } ?? ""
            var tail = city.isEmpty ? "" : ", \(city)"
            tail += " · \(FollowDates.when(e.at))"
            if let first = Self.firstSentence(e.comment) { tail += " · “\(first)”" }
            text = Text(verbatim: e.place).fontWeight(.semibold).foregroundColor(Palette.tx) + Text(verbatim: tail)
        }
        return text.font(.sans(14)).foregroundStyle(Palette.tx2).lineLimit(2)
    }

    /// "Rainy and perfect." from "Rainy and perfect. The train came through at seven."
    static func firstSentence(_ s: String?) -> String? {
        guard let s = s?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else { return nil }
        if let r = s.range(of: ". ") { return String(s[..<r.lowerBound]) + "." }
        return s.count > 60 ? String(s.prefix(57)) + "…" : s
    }
}

private struct FeedItem: View {
    let event: FollowedEvent
    let journey: FollowedJourney?
    let count: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if event.isArrival {
                head(journey?.who ?? event.authorName ?? "", Text(verbatim: FollowDates.when(event.at)))
                Text("Arrived in \(event.city)").font(.serif(16)).foregroundStyle(Palette.ac2Deep)
                if let j = journey, let i = j.stopIndex(of: event), i > 0 {
                    Text(verbatim: Self.from(j.stops[i - 1].city, mode: j.leg(into: i)?.mode))
                        .font(.sans(14)).foregroundStyle(Palette.tx2)
                }
            } else {
                head(event.authorName ?? "", Text("checked in · \(FollowDates.when(event.at))"))
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    let city = journey.flatMap { j in j.stopIndex(of: event).map { j.stops[$0].city } } ?? ""
                    Text(verbatim: city.isEmpty ? event.place : "\(event.place), \(city)")
                        .font(.serif(16)).foregroundStyle(Palette.tx)
                    if let r = event.rating, r > 0 { Stars(rating: r) }
                }
                if let words = event.comment, !words.isEmpty {
                    Text(verbatim: "“\(words)”").font(.sans(14)).foregroundStyle(Palette.tx2).lineLimit(3)
                }
                if count > 0 {
                    (count == 1 ? Text("1 comment") : Text("\(count) comments"))
                        .font(.sans(12.5, weight: .medium)).foregroundStyle(Palette.ac)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(event.isArrival ? Palette.ac2Soft : Palette.sf, in: .rect(cornerRadius: Radius.r - 4))
        .shadow(color: .black.opacity(event.isArrival ? 0 : 0.05), radius: 3, y: 1)
        .accessibilityElement(children: .combine)
    }

    /// "By train from Hanoi"
    static func from(_ city: String, mode: String?) -> String {
        switch mode {
        case "flight": String(localized: "By plane from \(city)")
        case "train": String(localized: "By train from \(city)")
        case "bus": String(localized: "By bus from \(city)")
        case "ferry": String(localized: "By ferry from \(city)")
        default: String(localized: "From \(city)")
        }
    }

    private func head(_ who: String, _ rest: Text) -> some View {
        (Text(verbatim: who).fontWeight(.semibold).foregroundColor(Palette.tx) + Text(verbatim: " ") + rest)
            .font(.sans(13)).foregroundStyle(Palette.tx3)
    }
}
