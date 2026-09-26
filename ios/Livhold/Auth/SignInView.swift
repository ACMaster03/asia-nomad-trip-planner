import AuthenticationServices
import SwiftUI

/// The way in (mock screens 1 and 3, signed off 2026-09-26). Same wash, brand stack
/// and "Sign in, traveller" as livhold.com/login. Apple on top; an emailed code in
/// place of the web's magic link, because a link would open Safari; the password
/// route behind a link, exactly as on the web.
struct SignInView: View {
    @Environment(AuthStore.self) private var store
    @Environment(\.colorScheme) private var colorScheme

    private enum Mode { case code, password }

    @State private var mode = Mode.code
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?
    @State private var notice: String?
    @State private var codeSentTo: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    BrandStack()
                        .padding(.top, 24)
                    Text("Sign in,\ntraveller")
                        .font(.serif(40, weight: .medium, relativeTo: .largeTitle))
                        .tracking(-0.4)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(Palette.tx)
                        .padding(.top, 32)
                        .padding(.bottom, 28)

                    VStack(spacing: 14) {
                        if mode == .code { appleButton; or }
                        form
                        if let error { Notice(text: error, kind: .warn) }
                        if let notice { Notice(text: notice) }
                    }
                    // On a phone the wash's hills sit right under the form (on the web the
                    // page scrolls past them), so the form gets a frosted panel to stay legible.
                    .padding(16)
                    .background(.ultraThinMaterial, in: .rect(cornerRadius: Radius.r + 6))
                    .background(Palette.sf.opacity(0.35), in: .rect(cornerRadius: Radius.r + 6))
                    .padding(.horizontal, -8)

                    Spacer(minLength: 32)

                    VStack(spacing: 14) {
                        if mode == .code {
                            Notice(text: "Already use Livhold on the web? Sign in with your email first. You can add Apple afterwards in Account.")
                        }
                        fineprint
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 16)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .wash(Wash.login)
            .navigationDestination(item: $codeSentTo) { address in
                CodeEntryView(email: address)
            }
            .animation(.smooth(duration: 0.25), value: mode)
        }
    }

    // MARK: pieces

    private var appleButton: some View {
        SignInWithAppleButton(.continue) { request in
            store.prepare(request)
        } onCompletion: { result in
            run { try await store.signInWithApple(result) }
        }
        // Apple's own button, as its guidelines require — the one non-Livhold colour here.
        .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
        .frame(height: 52)
        .clipShape(.rect(cornerRadius: Radius.rCtl))
        .id(colorScheme) // the style is read once; rebuild on appearance change
    }

    private var or: some View {
        HStack(spacing: 12) {
            Rectangle().fill(Palette.ln2).frame(height: 1)
            Text("or").font(.sans(15)).foregroundStyle(Palette.tx3)
            Rectangle().fill(Palette.ln2).frame(height: 1)
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder private var form: some View {
        VStack(alignment: .leading, spacing: 8) {
            FieldLabel("Email")
            Field(placeholder: "you@example.com", text: $email)
                .textContentType(.username)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(mode == .code ? .send : .next)
                .onSubmit { if mode == .code { sendCode() } }
        }

        if mode == .password {
            VStack(alignment: .leading, spacing: 8) {
                FieldLabel("Password")
                Field(placeholder: "Your password", text: $password, isSecure: true)
                    .textContentType(.password)
                    .submitLabel(.go)
                    .onSubmit(signInWithPassword)
            }
        }

        Button(mode == .code ? "Email me a code" : "Sign in") {
            mode == .code ? sendCode() : signInWithPassword()
        }
        .buttonStyle(.primary)
        .disabled(busy || !looksLikeEmail || (mode == .password && password.isEmpty))
        .overlay { if busy { ProgressView().tint(Palette.on) } }

        if mode == .code {
            LinkButton("Use a password instead") { switchTo(.password) }
        } else {
            LinkButton("Forgot your password?", action: sendReset)
                .disabled(busy)
            LinkButton("Email me a code instead", quiet: true) { switchTo(.code) }
        }
    }

    private var fineprint: some View {
        let web = Backend.current.web
        return Text("By continuing you agree to the [Terms](\(web.appending(path: "terms"))) and the [Privacy Policy](\(web.appending(path: "privacy"))).")
            .font(.sans(13))
            .foregroundStyle(Palette.tx3)
            .tint(Palette.tx2)
            .multilineTextAlignment(.center)
    }

    // MARK: actions

    private var looksLikeEmail: Bool {
        let e = email.trimmingCharacters(in: .whitespaces)
        return e.contains("@") && e.contains(".") && e.count >= 5
    }

    private func switchTo(_ next: Mode) {
        error = nil
        notice = nil
        mode = next
    }

    private func sendCode() {
        guard looksLikeEmail, !busy else { return }
        run {
            try await store.sendCode(to: email)
            codeSentTo = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        }
    }

    private func signInWithPassword() {
        guard looksLikeEmail, !password.isEmpty, !busy else { return }
        run { try await store.signIn(email: email, password: password) }
    }

    private func sendReset() {
        guard looksLikeEmail else {
            error = "Type your email above first, then tap “Forgot your password?” again."
            return
        }
        run {
            try await store.sendPasswordReset(to: email)
            notice = "Check your inbox — the reset link opens Livhold on the web."
        }
    }

    private func run(_ work: @escaping @MainActor () async throws -> Void) {
        busy = true
        error = nil
        notice = nil
        Task {
            defer { busy = false }
            do { try await work() } catch { self.error = AuthStore.message(for: error) }
        }
    }
}

/// Mark, wordmark and tagline. Web: the `lv-brand` stack on /login.
struct BrandStack: View {
    var body: some View {
        VStack(spacing: 12) {
            Image("Mark").resizable().scaledToFit().frame(width: 64, height: 64)
                .accessibilityHidden(true)
            Text("Livhold")
                .font(.sans(18, weight: .medium))
                .textCase(.uppercase)
                .tracking(18 * 0.18)
                .foregroundStyle(Palette.ac2Deep)
            Text("the living journey, held together")
                .font(.sans(15))
                .tracking(15 * 0.06)
                .foregroundStyle(Palette.tx.opacity(0.6))
                .padding(.top, -4)
        }
        .accessibilityElement(children: .combine)
    }
}

/// Uppercase field label. Web: `text-base uppercase tracking-[.1em] text-tx2`.
struct FieldLabel: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(.sans(16))
            .textCase(.uppercase)
            .tracking(1.6)
            .foregroundStyle(Palette.tx2)
    }
}

/// A text-only action under a form ("Use a password instead").
struct LinkButton: View {
    let title: String
    var quiet = false
    let action: () -> Void

    init(_ title: String, quiet: Bool = false, action: @escaping () -> Void) {
        self.title = title
        self.quiet = quiet
        self.action = action
    }

    var body: some View {
        Button(title, action: action)
            .font(.sans(16, weight: .medium))
            .foregroundStyle(quiet ? Palette.tx2 : Palette.ac)
            .frame(maxWidth: .infinity, minHeight: 44)
    }
}
