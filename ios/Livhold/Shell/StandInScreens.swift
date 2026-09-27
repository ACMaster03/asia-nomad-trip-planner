import SwiftUI

// STAND-INS. These exist so the spine (tabs, stacks, Check in, re-tap) can be felt
// on a phone before any real screen is built. Each is replaced by the real Home,
// Trip, Money and Map in its own round; the figures are the mock's, not your data.

/// A tab's first screen: its own header, a long scroll, and scroll-to-top when the
/// tab is tapped again at its root.
private struct TabPage<Header: View, Content: View>: View {
    let tab: AppTab
    @ViewBuilder var header: Header
    @ViewBuilder var content: Content
    @Environment(TabRouter.self) private var router

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    header.id("top")
                    content
                    Text("Stand-in screen — the real \(tab.title) comes in its own round.")
                        .font(.sans(13))
                        .foregroundStyle(Palette.tx3)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 24)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
            .background(Palette.canvas.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .onChange(of: router.scrollToTop[tab]) {
                withAnimation(.smooth) { proxy.scrollTo("top", anchor: .top) }
            }
        }
    }
}

private struct StandInCard: View {
    let kicker: String
    let title: String
    let detail: String

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 3) {
                Text(kicker)
                    .font(.sans(12, weight: .medium))
                    .textCase(.uppercase)
                    .tracking(1.2)
                    .foregroundStyle(Palette.tx3)
                Text(title).font(.serif(20)).foregroundStyle(Palette.tx)
                Text(detail).font(.sans(15)).foregroundStyle(Palette.tx2)
            }
        }
        .settlesOnScroll()
    }
}

// MARK: - Home

struct HomeScreen: View {
    @Environment(AuthStore.self) private var auth

    var body: some View {
        TabPage(tab: .home) {
            HStack(spacing: 10) {
                NavigationLink(value: Route.account) {
                    Avatar(name: auth.firstName ?? auth.email ?? "L")
                }
                .accessibilityLabel("Account")
                Text("Hi, \(auth.firstName ?? "traveller")")
                    .font(.serif(24))
                    .foregroundStyle(Palette.tx)
                Spacer()
            }
        } content: {
            StandInCard(kicker: "Now · day 12 of 64", title: "Da Lat", detail: "Nest Homestay · 3 of 5 nights")
            StandInCard(kicker: "Next", title: "Bus to Nha Trang", detail: "Sat 3 Oct · 08:30 · booked")
            Card {
                Text("Money").font(.sans(12, weight: .medium)).textCase(.uppercase).tracking(1.2).foregroundStyle(Palette.tx3)
                HStack(alignment: .firstTextBaseline) {
                    Text("€1 842 spent").font(.sans(20, weight: .semibold)).foregroundStyle(Palette.tx)
                    Spacer()
                    Text("of €5 200").font(.sans(14)).foregroundStyle(Palette.tx3)
                }
                ProgressTrack(value: 0.35)
            }
            StandInCard(kicker: "Following", title: "Anna is in Kampot", detail: "checked in 2 h ago")
            StandInCard(kicker: "Following", title: "Máté is in Luang Prabang", detail: "checked in yesterday")
        }
    }
}

// MARK: - Trip

struct TripScreen: View {
    @Environment(\.tabZoom) private var zoom

    private var stops: [(String, String)] { Self.stops }

    static let stops: [(String, String)] = [
        ("Ho Chi Minh City", "18 → 22 Sep · 4 nights"),
        ("Mũi Né", "22 → 25 Sep · 3 nights"),
        ("Da Lat", "25 Sep → 4 Oct · now"),
        ("Nha Trang", "4 → 7 Oct"),
        ("Hội An", "8 → 13 Oct"),
        ("Huế", "13 → 16 Oct"),
        ("Hà Nội", "16 → 21 Oct"),
        ("Luang Prabang", "22 → 27 Oct"),
    ]

    var body: some View {
        TabPage(tab: .trip) {
            HStack {
                Text("Vietnam & Laos").font(.serif(26)).foregroundStyle(Palette.tx)
                Spacer()
                NavigationLink(value: Route.tripSettings) {
                    Image(systemName: "gearshape")
                }
                .buttonStyle(.icon)
                .accessibilityLabel("Trip settings")
            }
        } content: {
            ForEach(stops, id: \.0) { stop in
                NavigationLink(value: Route.stop(stop.0)) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(stop.0).font(.serif(19)).foregroundStyle(Palette.tx)
                            Text(stop.1).font(.sans(14)).foregroundStyle(Palette.tx2)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").foregroundStyle(Palette.tx3)
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 14)
                    .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
                    // The card grows into the stop's screen and shrinks back on the way out.
                    .modifier(ZoomSource(id: Route.stop(stop.0), namespace: zoom))
                }
                .buttonStyle(.plain)
                .settlesOnScroll()
            }
        }
    }
}

/// A stop opens as a place, not another list: a landscape header with the name large
/// over it, so the card visibly grows into a scene (2026-09-27, "it blends together").
/// The wash stands in for a photo of the place.
struct StopScreen: View {
    let name: String

    private var dates: String {
        TripScreen.stops.first { $0.0 == name }?.1 ?? ""
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                hero
                VStack(alignment: .leading, spacing: 12) {
                    StandInCard(kicker: "Stay", title: "Nest Homestay", detail: "5 nights")
                    StandInCard(kicker: "Plans", title: "Langbiang at sunrise", detail: "Thu · with Petra")
                    StandInCard(kicker: "Notes", title: "Night market", detail: "Try the bánh tráng nướng")
                    StandInCard(kicker: "Money here", title: "€212 so far", detail: "stays, food, the jeep to Langbiang")
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

    private var hero: some View {
        ZStack(alignment: .bottomLeading) {
            Wash.light.base
            Image(Wash.light.image)
                .resizable()
                .scaledToFill()
                .frame(height: 340, alignment: .bottom)
                .clipped()
            // Fades the picture into the page so the cards below belong to it.
            LinearGradient(
                colors: [Palette.canvas.opacity(0), Palette.canvas.opacity(0.85), Palette.canvas],
                startPoint: .init(x: 0.5, y: 0.45),
                endPoint: .bottom
            )
            VStack(alignment: .leading, spacing: 4) {
                Text(name)
                    .font(.serif(44, weight: .medium, relativeTo: .largeTitle))
                    .foregroundStyle(Palette.tx)
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
                Text(dates)
                    .font(.sans(16, weight: .medium))
                    .foregroundStyle(Palette.tx2)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 12)
        }
        .frame(height: 340)
    }
}

struct TripSettingsScreen: View {
    var body: some View {
        List {
            Section("Stand-in") {
                LabeledContent("Dates", value: "18 Sep → 21 Dec")
                LabeledContent("Currency", value: "EUR")
                LabeledContent("People", value: "Patrik, Petra")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Palette.canvas.ignoresSafeArea())
        .navigationTitle("Trip settings")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Money

struct MoneyScreen: View {
    var body: some View {
        TabPage(tab: .money) {
            Text("Money").font(.serif(26)).foregroundStyle(Palette.tx)
        } content: {
            Card {
                Text("On pace for €4 960").font(.serif(20)).foregroundStyle(Palette.tx)
                Text("€240 under your €5 200 cap").font(.sans(15)).foregroundStyle(Palette.tx2)
                ProgressTrack(value: 0.95)
            }
            ForEach(["Stays", "Transport", "Food & drink", "Activities", "Subscriptions", "All entries"], id: \.self) { row in
                HStack {
                    Text(row).font(.sans(16, weight: .medium)).foregroundStyle(Palette.tx)
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(Palette.tx3)
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 16)
                .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
            }
        }
    }
}

// MARK: - Map

struct MapScreen: View {
    var body: some View {
        TabPage(tab: .map) {
            Text("Map").font(.serif(26)).foregroundStyle(Palette.tx)
        } content: {
            RoundedRectangle(cornerRadius: Radius.r)
                .fill(Palette.ph)
                .frame(height: 420)
                .overlay {
                    Label("The globe goes here", systemImage: "globe.asia.australia")
                        .font(.sans(16, weight: .medium))
                        .foregroundStyle(Palette.tx2)
                }
        }
    }
}

// MARK: - Check in

/// Opens over whichever tab you're on, so checking in never loses your place.
/// The real contents come with the check-in round.
struct CheckInSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var choice = "Da Lat"
    @State private var done = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle("Where are you now?", size: 24)
            ForEach([("Da Lat", "today"), ("Nha Trang", "next stop")], id: \.0) { place in
                Button { choice = place.0 } label: {
                    HStack {
                        Text(place.0).font(.sans(16, weight: .medium))
                        Spacer()
                        Text(place.1).font(.sans(14)).foregroundStyle(Palette.tx3)
                    }
                    .foregroundStyle(Palette.tx)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(choice == place.0 ? Palette.acSoft : .clear, in: .rect(cornerRadius: Radius.r))
                    .overlay(
                        RoundedRectangle(cornerRadius: Radius.r)
                            .strokeBorder(choice == place.0 ? Palette.ac : Palette.ln2, lineWidth: 1.5)
                    )
                }
                .buttonStyle(.plain)
            }
            Spacer()
            // The one small celebration in the app: the button becomes the result,
            // a success tap, a beat to see it, then the sheet goes by itself.
            Button {
                guard !done else { return }
                withAnimation(Motion.settle) { done = true }
                Task {
                    try? await Task.sleep(for: .milliseconds(900))
                    dismiss()
                }
            } label: {
                if done {
                    Label("Checked in to \(choice)", systemImage: "checkmark")
                        .transition(.opacity.combined(with: .scale(scale: 0.9)))
                } else {
                    Text("Check in")
                }
            }
            .buttonStyle(.primary)
            .sensoryFeedback(.success, trigger: done) { _, now in now }
        }
        .padding(20)
        .padding(.top, 8)
        .livholdSheet(detents: [.medium])
    }
}
