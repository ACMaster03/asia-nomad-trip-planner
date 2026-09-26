import SwiftUI

/// Confirmation toast. Web `Toast`: `rounded-full bg-tx px-4 py-2.5 text-base font-medium text-canvas`,
/// floating above the tab bar, rising in with `lv-enter`.
struct Toast: View {
    let message: String

    var body: some View {
        Text(message)
            .font(.sans(16, weight: .medium))
            .foregroundStyle(Palette.canvas)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Palette.tx, in: .capsule)
            .padding(.horizontal, 18)
    }
}

extension View {
    /// Shows `message` for ~2.4s above the bottom edge, then clears it.
    func toast(_ message: Binding<String?>, bottomInset: CGFloat = 96) -> some View {
        overlay(alignment: .bottom) {
            if let text = message.wrappedValue {
                Toast(message: text)
                    .padding(.bottom, bottomInset)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .task(id: text) {
                        try? await Task.sleep(for: .seconds(2.4))
                        withAnimation(.easeOut(duration: 0.25)) { message.wrappedValue = nil }
                    }
                    .allowsHitTesting(false)
            }
        }
        .animation(.timingCurve(0.2, 0.7, 0.2, 1, duration: 0.3), value: message.wrappedValue)
        .sensoryFeedback(.success, trigger: message.wrappedValue) { _, new in new != nil }
    }
}
