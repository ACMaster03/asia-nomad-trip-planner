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
    let kicker: LocalizedStringKey
    let title: LocalizedStringKey
    let detail: LocalizedStringKey

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
                (auth.firstName.map { Text("Hi, \($0)") } ?? Text("Hi, traveller"))
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
            ForEach([("Da Lat", "today"), ("Nha Trang", "next stop")] as [(String, LocalizedStringKey)], id: \.0) { place in
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
