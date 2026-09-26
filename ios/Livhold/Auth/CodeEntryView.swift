import SwiftUI

/// "Check your inbox" (mock screen 2). Eight boxes split 4 · 4 like the email; the
/// last digit signs in, with no Continue button to find. iOS offers the code from
/// Mail above the keyboard (`.oneTimeCode`), and Paste covers the rest.
struct CodeEntryView: View {
    let email: String

    @Environment(AuthStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @FocusState private var focused: Bool

    @State private var code = ""
    @State private var busy = false
    @State private var error: String?
    @State private var resendAt = Date.now.addingTimeInterval(Self.resendWait)
    @State private var sent: String?

    /// Supabase refuses a second email to the same address within a minute
    /// (`max_frequency` in supabase/config.toml), so the web waits 60 s and so do we.
    private static let resendWait: TimeInterval = 60
    private static let length = 8

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Check your inbox")
                .font(.serif(30, weight: .medium, relativeTo: .title))
                .foregroundStyle(Palette.tx)
            Text("We sent an \(Self.length)-digit code to **\(email)**. It works once and expires in an hour.")
                .font(.sans(16))
                .foregroundStyle(Palette.tx2)

            boxes
                .padding(.top, 8)

            PasteButton(payloadType: String.self) { strings in
                guard let pasted = strings.first else { return }
                Task { @MainActor in take(pasted) }
            }
            .buttonBorderShape(.capsule)
            .tint(Palette.ac)
            .labelStyle(.titleAndIcon)
            .frame(maxWidth: .infinity)

            if let error { Notice(text: error, kind: .warn) }

            Spacer()

            TimelineView(.periodic(from: .now, by: 1)) { context in
                let left = Int(resendAt.timeIntervalSince(context.date).rounded(.up))
                LinkButton(left > 0 ? "Email me again in \(left) s" : "Email me again", action: resend)
                    .disabled(left > 0 || busy)
            }
            LinkButton("Use a different email", quiet: true) { dismiss() }
        }
        .padding(.horizontal, 24)
        .padding(.top, 8)
        .padding(.bottom, 12)
        .frame(maxWidth: 480)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Palette.canvas.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .toast($sent, bottomInset: 24)
        .onAppear { focused = true }
    }

    /// One real text field, invisible, under eight drawn boxes: that keeps the
    /// keyboard's code suggestion, paste and VoiceOver working as for any field.
    private var boxes: some View {
        let digits = Array(code)
        return ZStack {
            TextField("", text: $code)
                .textContentType(.oneTimeCode)
                .keyboardType(.numberPad)
                .focused($focused)
                .opacity(0.02)
                .accessibilityLabel("\(Self.length)-digit code")
                .onChange(of: code) { _, new in take(new) }

            HStack(spacing: 6) {
                ForEach(0..<Self.length, id: \.self) { i in
                    if i == Self.length / 2 {
                        Capsule().fill(Palette.ln3).frame(width: 8, height: 2)
                    }
                    let current = i == digits.count && focused && !busy
                    Text(i < digits.count ? String(digits[i]) : "")
                        .font(.sans(24, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Palette.tx)
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                        .background(Palette.sf, in: .rect(cornerRadius: 14))
                        .overlay(
                            RoundedRectangle(cornerRadius: 14)
                                .strokeBorder(current ? Palette.ac : Palette.ln2, lineWidth: 1.5)
                        )
                }
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .opacity(busy ? 0.5 : 1)
        }
        .contentShape(.rect)
        .onTapGesture { focused = true }
    }

    /// Keeps digits only, at most eight, and signs in when all eight are there.
    private func take(_ input: String) {
        let digits = String(input.filter(\.isNumber).prefix(Self.length))
        if digits != code { code = digits }
        guard digits.count == Self.length, !busy else { return }
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                try await store.verify(code: digits, email: email)
                // Signed in: AuthStore's phase flips and the root swaps this whole stack out.
            } catch {
                self.error = AuthStore.message(for: error)
                code = ""
                focused = true
            }
        }
    }

    private func resend() {
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                try await store.sendCode(to: email)
                resendAt = .now.addingTimeInterval(Self.resendWait)
                sent = "New code sent"
            } catch {
                self.error = AuthStore.message(for: error)
            }
        }
    }
}
