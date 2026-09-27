import SwiftUI

/// Livhold sheet chrome on the native sheet. The web draws its own (`lv-sheet`, a 44×5
/// `bg-ln3` grabber, `rounded-[22px] bg-sf`); here the system sheet gets the same
/// surface and radius, and keeps native detents and drag-to-dismiss.
extension View {
    func livholdSheet(detents: Set<PresentationDetent> = [.medium, .large]) -> some View {
        self
            .livholdText()
            .presentationDetents(detents)
            .presentationDragIndicator(.visible)
            .presentationCornerRadius(Radius.r)
            .presentationBackground(Palette.sf)
    }
}

/// Section heading used on screens and inside sheets. Web: `font-serif text-[19px] font-semibold`.
struct SectionTitle: View {
    let text: Text
    var size: CGFloat = 19

    init(_ key: LocalizedStringKey, size: CGFloat = 19) {
        self.text = Text(key)
        self.size = size
    }

    @_disfavoredOverload
    init(_ text: String, size: CGFloat = 19) {
        self.text = Text(verbatim: text)
        self.size = size
    }

    var body: some View {
        text.font(.serif(size)).foregroundStyle(Palette.tx)
    }
}
