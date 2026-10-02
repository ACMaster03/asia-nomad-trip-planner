import SwiftUI

// Zoom transitions (iOS 18+): a card grows into the screen it opens and shrinks
// back into place on the way out, the way Photos opens a picture. Where iOS is
// older, the plain push or sheet is kept.

extension EnvironmentValues {
    /// The namespace of the tab's navigation stack, for card → screen zooms.
    @Entry var tabZoom: Namespace.ID?
    /// The shell's namespace, for Check in → sheet zooms.
    @Entry var checkInZoom: Namespace.ID?
}

/// Marks the view a zoom starts from.
struct ZoomSource: ViewModifier {
    let id: AnyHashable
    let namespace: Namespace.ID?

    func body(content: Content) -> some View {
        if #available(iOS 18, *), let namespace {
            content.matchedTransitionSource(id: id, in: namespace)
        } else {
            content
        }
    }
}

/// Marks the screen or sheet a zoom lands on.
struct ZoomDestination: ViewModifier {
    let id: AnyHashable
    let namespace: Namespace.ID?

    func body(content: Content) -> some View {
        if #available(iOS 18, *), let namespace {
            content.navigationTransition(.zoom(sourceID: id, in: namespace))
        } else {
            content
        }
    }
}
