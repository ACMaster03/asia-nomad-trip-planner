import SwiftUI

/// Livhold's "working on it": a dot travelling between two stops along a dashed
/// route, the Trip icon brought to life. Used wherever the app must wait on the
/// network — in place of a spinner, so even a bad connection feels like the app.
struct TravelLoader: View {
    var color: Color = Palette.ac
    var width: CGFloat = 64

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { context in
            let t = progress(at: context.date)
            ZStack(alignment: .leading) {
                Path { p in
                    p.move(to: CGPoint(x: 5, y: 7))
                    p.addLine(to: CGPoint(x: width - 5, y: 7))
                }
                .stroke(color.opacity(0.45), style: StrokeStyle(lineWidth: 1.5, lineCap: .round, dash: [2, 4]))
                Circle().strokeBorder(color, lineWidth: 1.5).frame(width: 10, height: 10).offset(x: 0)
                Circle().strokeBorder(color, lineWidth: 1.5).frame(width: 10, height: 10).offset(x: width - 10)
                Circle().fill(color).frame(width: 8, height: 8)
                    .offset(x: 1 + (width - 10) * t)
            }
            .frame(width: width, height: 14)
        }
        .accessibilityLabel("Working on it")
    }

    /// 0 → 1 → 0 over 2.4 s, easing in and out, resting a beat at each stop.
    private func progress(at date: Date) -> CGFloat {
        if reduceMotion { return 0.5 }
        let period = 2.4
        let phase = date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: period) / period
        let leg = phase < 0.5 ? phase * 2 : (1 - phase) * 2    // 0 → 1 → 0
        let held = min(max((leg - 0.1) / 0.8, 0), 1)          // rest at both ends
        return CGFloat(held * held * (3 - 2 * held))           // smoothstep
    }
}

/// What to say while waiting, and only when there is something worth saying:
/// nothing for the first seconds, then the honest reason, offline or slow.
struct WaitingNote: View {
    let since: Date
    var onCancel: (() -> Void)?

    @State private var connectivity = Connectivity.shared

    var body: some View {
        TimelineView(.periodic(from: since, by: 1)) { context in
            let waited = context.date.timeIntervalSince(since)
            if let text = message(waited: waited) {
                VStack(spacing: 6) {
                    Text(text)
                        .font(.sans(15))
                        .foregroundStyle(Palette.tagInk)
                        .multilineTextAlignment(.center)
                    if let onCancel {
                        Button("Cancel", action: onCancel)
                            .font(.sans(15, weight: .semibold))
                            .foregroundStyle(Palette.tx2)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(Palette.tag, in: .rect(cornerRadius: Radius.r))
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .animation(.smooth, value: connectivity.isOnline)
    }

    private func message(waited: TimeInterval) -> String? {
        if !connectivity.isOnline {
            return "No connection right now. Stay on this screen and it goes through the moment you’re back online."
        }
        if waited > 4 {
            return "Slow connection — still getting through. On a bus or up a mountain this can take a minute."
        }
        return nil
    }
}

#Preview {
    VStack(spacing: 24) {
        TravelLoader()
        TravelLoader(color: Palette.on)
            .padding()
            .background(Palette.ac, in: .capsule)
        WaitingNote(since: .now.addingTimeInterval(-10)) {}
    }
    .padding()
}
