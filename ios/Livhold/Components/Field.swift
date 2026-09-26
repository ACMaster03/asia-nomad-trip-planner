import SwiftUI

/// Text input. Web: `rounded-[22px] border-[1.5px] border-ln2 bg-sf/90 px-4 py-3.5`, and on focus
/// `border-ac shadow-[0_0_0_4px_var(--acSoft)]` over 180ms.
struct Field: View {
    let placeholder: String
    @Binding var text: String
    @FocusState private var focused: Bool

    var body: some View {
        TextField(placeholder, text: $text)
            .font(.sans(16))
            .foregroundStyle(Palette.tx)
            .tint(Palette.ac)
            .focused($focused)
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(Palette.sf.opacity(0.9), in: .rect(cornerRadius: Radius.r))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.r)
                    .strokeBorder(focused ? Palette.ac : Palette.ln2, lineWidth: 1.5)
            )
            .background(
                RoundedRectangle(cornerRadius: Radius.r + 4)
                    .fill(Palette.acSoft)
                    .padding(-4)
                    .opacity(focused ? 1 : 0)
            )
            .animation(.easeOut(duration: 0.18), value: focused)
    }
}
