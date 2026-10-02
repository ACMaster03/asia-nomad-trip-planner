import SwiftUI

/// The bar Patrik asked for on 2026-09-27: iOS's Liquid Glass, but laid out like the
/// web's bar, with a meaningfully bigger raised Check in circle carrying the pin in
/// the middle. The system TabView can't place anything there, so this draws its own
/// bar from the same glass material (iOS 26+; a frosted material on older iOS).
struct GlassTabBar: View {
    @Binding var selection: AppTab
    var onCheckIn: () -> Void = {}

    @Namespace private var highlight
    @State private var checkInTaps = 0
    @Environment(\.checkInZoom) private var zoom

    private let circle: CGFloat = 56
    /// Room a screen keeps free under its content for the bar: the capsule, its
    /// bottom padding, and the part of the pin circle that rises above it.
    static let reservedHeight: CGFloat = 80

    var body: some View {
        HStack(spacing: 0) {
            tab(.home)
            tab(.trip)
            checkIn
            tab(.money)
            tab(.map)
        }
        .padding(.horizontal, 6)
        .frame(height: 64)
        .background { barSurface }
        .padding(.horizontal, 16)
        .padding(.bottom, 4)
        .frame(maxWidth: 520)
        .frame(maxWidth: .infinity)
    }

    // MARK: pieces

    @ViewBuilder private var barSurface: some View {
        if #available(iOS 26, *) {
            Capsule().fill(.clear).glassEffect(.regular, in: .capsule)
        } else {
            Capsule().fill(.ultraThinMaterial)
                .overlay(Capsule().strokeBorder(Palette.ln, lineWidth: 1))
                .shadow(color: .black.opacity(0.12), radius: 16, y: 6)
        }
    }

    private func tab(_ t: AppTab) -> some View {
        let active = selection == t
        return Button {
            withAnimation(Motion.quick) { selection = t }
        } label: {
            VStack(spacing: 2) {
                Image(systemName: t.symbol)
                    .font(.system(size: 20, weight: active ? .semibold : .regular))
                    .frame(height: 24)
                Text(t.title).font(.sans(11, weight: active ? .semibold : .medium, relativeTo: .caption2))
            }
            .foregroundStyle(active ? Palette.ac : Palette.tx2)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background {
                // One highlight that slides to the tab you pick.
                if active {
                    Capsule()
                        .fill(Palette.ac.opacity(0.12))
                        .matchedGeometryEffect(id: "highlight", in: highlight)
                }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.selection, trigger: active) { _, now in now }
        .accessibilityAddTraits(active ? .isSelected : [])
    }

    private var checkIn: some View {
        Button {
            checkInTaps += 1
            onCheckIn()
        } label: {
            // Same stack as the other tabs, so "Check in" sits on their baseline; the
            // circle is drawn over the icon slot and rises above the bar from there.
            VStack(spacing: 2) {
                Color.clear
                    .frame(height: 24)
                    .overlay(alignment: .bottom) { pinCircle.padding(.bottom, 5) }
                Text("Check in")
                    .font(.sans(11, weight: .semibold, relativeTo: .caption2))
                    .foregroundStyle(Palette.ac)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.impact(weight: .medium), trigger: checkInTaps)
        .accessibilityLabel("Check in")
    }

    @ViewBuilder private var pinCircle: some View {
        let pin = Image(systemName: "mappin.and.ellipse")
            .font(.system(size: 24, weight: .semibold))
            .foregroundStyle(Palette.on)
            .frame(width: circle, height: circle)
        if #available(iOS 26, *) {
            pin
                .glassEffect(.regular.tint(Palette.ac).interactive(), in: .circle)
                .modifier(ZoomSource(id: "checkin", namespace: zoom))
        } else {
            pin
                .background(Palette.ac, in: .circle)
                .shadow(color: .black.opacity(0.2), radius: 10, y: 4)
                .modifier(ZoomSource(id: "checkin", namespace: zoom))
        }
    }
}
