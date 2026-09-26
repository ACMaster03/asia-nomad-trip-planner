import SwiftUI

/// The surface every screen is built from. Web: `rounded-[var(--r)] bg-sf p-4`.
struct Card<Content: View>: View {
    var padding: EdgeInsets = EdgeInsets(top: 16, leading: 18, bottom: 16, trailing: 18)
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(padding)
            .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
    }
}

/// Inline notices on a screen.
/// - `.info`: web `rounded-[22px] bg-tag px-4 py-3.5 font-medium text-tag-ink`
/// - `.warn`: web `rounded-[22px] border border-warn-line bg-warn-soft px-4 py-3.5 text-warn`
struct Notice: View {
    enum Kind { case info, warn }

    let text: String
    var kind: Kind = .info

    var body: some View {
        Text(text)
            .font(.sans(16, weight: kind == .info ? .medium : .regular))
            .foregroundStyle(kind == .info ? Palette.tagInk : Palette.warn)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(kind == .info ? Palette.tag : Palette.warnSoft, in: .rect(cornerRadius: Radius.r))
            .overlay {
                if kind == .warn {
                    RoundedRectangle(cornerRadius: Radius.r).strokeBorder(Palette.warnLine, lineWidth: 1)
                }
            }
    }
}

/// Budget / progress track. Web: `h-2.5 rounded-full bg-track` with a `bg-ac` fill that grows in (`lv-grow`).
struct ProgressTrack: View {
    let value: Double
    var tint: Color = Palette.ac
    @State private var shown = 0.0

    var body: some View {
        GeometryReader { geo in
            Capsule().fill(Palette.tr)
                .overlay(alignment: .leading) {
                    Capsule().fill(tint).frame(width: geo.size.width * min(max(shown, 0), 1))
                }
        }
        .frame(height: 10)
        .onAppear { withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.7)) { shown = value } }
        .onChange(of: value) { _, v in withAnimation(.smooth) { shown = v } }
    }
}
