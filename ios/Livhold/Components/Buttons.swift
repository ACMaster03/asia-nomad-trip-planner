import SwiftUI

/// Primary action. Web: `w-full rounded-[var(--rCtl)] bg-ac py-3.5 text-base font-semibold text-on`.
struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.sans(16, weight: .semibold))
            .foregroundStyle(Palette.on)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Palette.ac, in: .rect(cornerRadius: Radius.rCtl))
            .opacity(isEnabled ? 1 : 0.5)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.spring(duration: 0.2), value: configuration.isPressed)
    }
}

/// Destructive / second-accent action. Web: `rounded-[22px] border-[1.5px] border-ac2 bg-blush py-[15px] font-semibold text-ac2-deep`.
struct DangerButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.sans(16, weight: .semibold))
            .foregroundStyle(Palette.ac2Deep)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(Palette.blush, in: .rect(cornerRadius: Radius.r))
            .overlay(RoundedRectangle(cornerRadius: Radius.r).strokeBorder(Palette.ac2, lineWidth: 1.5))
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

/// Quiet action on a card. Web: `min-h-11 rounded-full bg-canvas px-5 text-base font-semibold text-tx`.
struct QuietButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.sans(16, weight: .semibold))
            .foregroundStyle(Palette.tx)
            .padding(.horizontal, 20)
            .frame(minHeight: 44)
            .background(Palette.canvas, in: .capsule)
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

/// Round icon button. Web: `size-11 rounded-full border border-ln2 bg-sf text-tx2`.
struct IconButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 18, weight: .medium))
            .foregroundStyle(Palette.tx2)
            .frame(width: 44, height: 44)
            .background(Palette.sf, in: .circle)
            .overlay(Circle().strokeBorder(Palette.ln2, lineWidth: 1))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

extension ButtonStyle where Self == PrimaryButtonStyle { static var primary: Self { .init() } }
extension ButtonStyle where Self == DangerButtonStyle { static var danger: Self { .init() } }
extension ButtonStyle where Self == QuietButtonStyle { static var quiet: Self { .init() } }
extension ButtonStyle where Self == IconButtonStyle { static var icon: Self { .init() } }
