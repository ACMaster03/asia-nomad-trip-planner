import SwiftUI

/// The bottom bar from web `AppNav`: four icon+label tabs and, while a trip is live,
/// a raised Check in circle in the middle that carries a visible label like its siblings.
///
/// Icons are SF Symbols stand-ins for the web's Lucide set (House, Route, Wallet, Map,
/// MapPin) until the Lucide-vs-SF-Symbols decision is made.
enum AppTab: String, CaseIterable, Identifiable {
    case home, trip, money, map
    var id: Self { self }

    var title: String {
        switch self {
        case .home: "Home"
        case .trip: "Trip"
        case .money: "Money"
        case .map: "Map"
        }
    }

    var symbol: String {
        switch self {
        case .home: "house"
        case .trip: "point.topleft.down.to.point.bottomright.curvepath"
        case .money: "wallet.bifold"
        case .map: "map"
        }
    }
}

struct TabBar: View {
    @Binding var selection: AppTab
    var showCheckIn = true
    var onCheckIn: () -> Void = {}
    @State private var checkInTaps = 0

    var body: some View {
        HStack(spacing: 0) {
            tab(.home)
            tab(.trip)
            if showCheckIn { checkIn }
            tab(.money)
            tab(.map)
        }
        .frame(maxWidth: 512)
        .frame(maxWidth: .infinity)
        .background(alignment: .top) {
            Palette.sf
                .overlay(alignment: .top) { Palette.ln.frame(height: 1) }
                .ignoresSafeArea(edges: .bottom)
        }
    }

    private func tab(_ t: AppTab) -> some View {
        let active = selection == t
        return Button {
            selection = t
        } label: {
            VStack(spacing: 2) {
                Image(systemName: t.symbol)
                    .font(.system(size: 22, weight: active ? .semibold : .regular))
                    .frame(height: 26)
                Text(t.title).font(.sans(12, weight: active ? .semibold : .regular, relativeTo: .caption2))
            }
            .foregroundStyle(active ? Palette.ac : Palette.tx3)
            .frame(maxWidth: .infinity)
            .padding(.top, 8)
            .padding(.bottom, 6)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.selection, trigger: active)
        .accessibilityAddTraits(active ? .isSelected : [])
    }

    private var checkIn: some View {
        Button {
            checkInTaps += 1
            onCheckIn()
        } label: {
            VStack(spacing: 2) {
                Image(systemName: "mappin.and.ellipse")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(Palette.on)
                    .frame(width: 58, height: 58)
                    .background(Palette.ac, in: .circle)
                    .overlay(Circle().strokeBorder(Palette.sf, lineWidth: 4).padding(-4))
                    .shadow(color: .black.opacity(0.18), radius: 10, y: 4)
                Text("Check in")
                    .font(.sans(12, weight: .semibold, relativeTo: .caption2))
                    .foregroundStyle(Palette.ac)
            }
            .offset(y: -22)
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.impact(weight: .medium), trigger: checkInTaps)
        .frame(height: 56)
    }
}
