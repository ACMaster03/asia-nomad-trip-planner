import SwiftUI

/// Livhold's one pace for motion: soft springs, no bounce (2026-09-27, "premium,
/// calm"). Use these rather than ad-hoc durations so the whole app moves alike.
enum Motion {
    static let settle = Animation.smooth(duration: 0.35)
    static let quick = Animation.snappy(duration: 0.22)
}

/// How a card's hidden part appears when it opens (a Plan stop, Bookings, How it
/// adds up). On trial (Patrik, 27 Sep): the first build slid the content down from
/// under the title, which read as disappearing upwards on close. Picked in the
/// Design gallery; applies app-wide.
enum ExpandStyle: String, CaseIterable, Identifiable {
    case fade, unfold, blur, slide
    var id: Self { self }

    var title: String {
        switch self {
        case .fade: String(localized: "Fade")
        case .unfold: String(localized: "Unfold")
        case .blur: String(localized: "Blur")
        case .slide: String(localized: "Slide")
        }
    }

    var detail: String {
        switch self {
        case .fade: String(localized: "The card grows; its content fades in where it stands, like Settings.")
        case .unfold: String(localized: "The content grows out of the title, a touch smaller at first.")
        case .blur: String(localized: "The content sharpens into place as the card grows.")
        case .slide: String(localized: "The first build: slides down from under the title.")
        }
    }

    var transition: AnyTransition {
        switch self {
        case .fade: .opacity
        case .unfold: .scale(scale: 0.94, anchor: .top).combined(with: .opacity)
        case .blur: AnyTransition(.blurReplace)
        case .slide: .opacity.combined(with: .move(edge: .top))
        }
    }
}

/// The transition for a card part that opens and closes, in the chosen style.
struct Expands: ViewModifier {
    @AppStorage("motion.expand") private var style: ExpandStyle = .fade

    func body(content: Content) -> some View {
        content.transition(style.transition)
    }
}

extension View {
    func expands() -> some View { modifier(Expands()) }

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

extension View {
    /// For a Menu (or a menu Picker) whose label changes with the pick. On iOS 26 the
    /// menu closes back into its label, and a label that changed width meanwhile was
    /// drawn in the old frame, clipped and square, for about a second before it
    /// snapped (Patrik, 27 Sep). A new identity per value lets the menu fade out and
    /// the new label lay out at its own width at once.
    func menuSettles<V: Hashable>(on value: V) -> some View {
        id(value)
    }
}
