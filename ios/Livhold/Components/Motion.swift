import SwiftUI

/// Livhold's one pace for motion: soft springs, no bounce (2026-09-27, "premium,
/// calm"). Use these rather than ad-hoc durations so the whole app moves alike.
enum Motion {
    static let settle = Animation.smooth(duration: 0.35)
    static let quick = Animation.snappy(duration: 0.22)
}

extension View {
    /// Cards settle in as they scroll into view: a touch smaller and lighter at the
    /// edges, full size once in view. Subtle on purpose; off with Reduce Motion.
    func settlesOnScroll() -> some View {
        scrollTransition(.animated(Motion.settle)) { content, phase in
            content
                .opacity(phase.isIdentity ? 1 : 0.6)
                .scaleEffect(phase.isIdentity ? 1 : 0.96, anchor: phase.value < 0 ? .bottom : .top)
        }
    }
}
