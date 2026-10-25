import SwiftUI

// STAND-INS. These exist so the spine (tabs, stacks, Check in) can be felt on a phone
// before the real screen is built. Check in is the last one; it is replaced in its own
// round.

// MARK: - Check in

/// Opens over whichever tab you're on, so checking in never loses your place.
/// The real contents come with the check-in round.
struct CheckInSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var choice = "Da Lat"
    @State private var done = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle("Where are you now?", size: 24)
            ForEach([("Da Lat", "today"), ("Nha Trang", "next stop")] as [(String, LocalizedStringKey)], id: \.0) { place in
                Button { choice = place.0 } label: {
                    HStack {
                        Text(place.0).font(.sans(16, weight: .medium))
                        Spacer()
                        Text(place.1).font(.sans(14)).foregroundStyle(Palette.tx3)
                    }
                    .foregroundStyle(Palette.tx)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(choice == place.0 ? Palette.acSoft : .clear, in: .rect(cornerRadius: Radius.r))
                    .overlay(
                        RoundedRectangle(cornerRadius: Radius.r)
                            .strokeBorder(choice == place.0 ? Palette.ac : Palette.ln2, lineWidth: 1.5)
                    )
                }
                .buttonStyle(.plain)
            }
            Spacer()
            // The one small celebration in the app: the button becomes the result,
            // a success tap, a beat to see it, then the sheet goes by itself.
            Button {
                guard !done else { return }
                withAnimation(Motion.settle) { done = true }
                Task {
                    try? await Task.sleep(for: .milliseconds(900))
                    dismiss()
                }
            } label: {
                if done {
                    Label("Checked in to \(choice)", systemImage: "checkmark")
                        .transition(.opacity.combined(with: .scale(scale: 0.9)))
                } else {
                    Text("Check in")
                }
            }
            .buttonStyle(.primary)
            .sensoryFeedback(.success, trigger: done) { _, now in now }
        }
        .padding(20)
        .padding(.top, 8)
        .livholdSheet(detents: [.medium])
    }
}
