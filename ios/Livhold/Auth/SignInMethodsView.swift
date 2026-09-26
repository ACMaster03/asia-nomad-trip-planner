import Supabase
import SwiftUI

/// Account → Sign-in methods (mock screen 4). This is where an existing web account
/// gets Apple: Connect attaches the Apple ID to THIS account, so "Continue with
/// Apple" opens it afterwards even behind Hide My Email.
struct SignInMethodsView: View {
    @Environment(AuthStore.self) private var store

    @State private var identities: [UserIdentity] = []
    @State private var loaded = false
    @State private var busy = false
    @State private var error: String?
    @State private var toast: String?
    @State private var confirmDisconnect: UserIdentity?
    @State private var showPassword = false

    private var apple: UserIdentity? { identities.first { $0.provider == "apple" } }
    private var hasEmail: Bool { identities.contains { $0.provider == "email" } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Ways you can get into this account. Your trips stay the same whichever you use.")
                    .font(.sans(16))
                    .foregroundStyle(Palette.tx2)

                FieldLabel("Connected").padding(.top, 4)
                Card(padding: EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 12)) {
                    VStack(spacing: 0) {
                        emailRow
                        Divider().overlay(Palette.ln)
                        appleRow
                        Divider().overlay(Palette.ln)
                        passwordRow
                    }
                }
                .redacted(reason: loaded ? [] : .placeholder)

                Notice(text: "After connecting, “Continue with Apple” opens this same account, even if you chose Hide My Email.")
                if let error { Notice(text: error, kind: .warn) }

                Text("You can’t remove the last way in, so nobody locks themselves out.")
                    .font(.sans(13))
                    .foregroundStyle(Palette.tx3)
                    .padding(.top, 8)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
        }
        .background(Palette.canvas.ignoresSafeArea())
        .navigationTitle("Sign-in methods")
        .navigationBarTitleDisplayMode(.inline)
        .toast($toast, bottomInset: 24)
        .task { await reload() }
        .refreshable { await reload() }
        .sheet(isPresented: $showPassword) {
            PasswordSheet { toast = "Password saved — you can sign in with it now" }
        }
        .confirmationDialog(
            "Disconnect Apple?",
            isPresented: .init(get: { confirmDisconnect != nil }, set: { if !$0 { confirmDisconnect = nil } }),
            titleVisibility: .visible,
            presenting: confirmDisconnect
        ) { identity in
            Button("Disconnect", role: .destructive) { disconnect(identity) }
        } message: { _ in
            Text("“Continue with Apple” will stop opening this account. You can connect it again any time.")
        }
    }

    // MARK: rows

    private var emailRow: some View {
        MethodRow(symbol: "at", title: "Email", detail: store.email ?? "—") {
            if hasEmail { StatusPill(title: "In use") }
        }
    }

    private var appleRow: some View {
        MethodRow(symbol: "apple.logo", title: "Apple", detail: appleDetail) {
            if let apple {
                Button("Disconnect") { confirmDisconnect = apple }
                    .buttonStyle(RowActionStyle(quiet: true))
                    .disabled(busy || identities.count < 2)
            } else {
                Button("Connect", action: connect)
                    .buttonStyle(RowActionStyle())
                    .disabled(busy || !loaded)
            }
        }
    }

    private var appleDetail: String {
        guard let apple else { return "Face ID next time" }
        if case let .string(address)? = apple.identityData?["email"] { return address }
        return "Connected"
    }

    /// Supabase does not tell the app whether a password exists, so the row offers
    /// both: set one, or replace the one you have. The web's Account → Password is the same.
    private var passwordRow: some View {
        MethodRow(symbol: "key", title: "Password", detail: "Set or change") {
            Button("Set") { showPassword = true }
                .buttonStyle(RowActionStyle(quiet: true))
        }
    }

    // MARK: actions

    private func reload() async {
        do {
            identities = try await store.identities()
            error = nil
        } catch {
            self.error = AuthStore.message(for: error)
        }
        loaded = true
    }

    private func connect() {
        busy = true
        error = nil
        Task {
            defer { busy = false }
            let result = await AppleAuthorization.run { store.prepare($0) }
            do {
                try await store.connectApple(result)
                await reload()
                toast = "Apple connected"
            } catch {
                self.error = AuthStore.message(for: error)
            }
        }
    }

    private func disconnect(_ identity: UserIdentity) {
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                try await store.disconnect(identity)
                await reload()
                toast = "Apple disconnected"
            } catch {
                self.error = AuthStore.message(for: error)
            }
        }
    }
}

// MARK: - pieces

private struct MethodRow<Trailing: View>: View {
    let symbol: String
    let title: String
    let detail: String
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Palette.tx2)
                .frame(width: 36, height: 36)
                .background(Palette.canvas, in: .circle)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.sans(16, weight: .semibold)).foregroundStyle(Palette.tx)
                Text(detail).font(.sans(14)).foregroundStyle(Palette.tx2).lineLimit(1).truncationMode(.middle)
            }
            Spacer(minLength: 8)
            trailing
        }
        .padding(.vertical, 10)
    }
}

private struct StatusPill: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.sans(13, weight: .semibold, relativeTo: .caption))
            .foregroundStyle(Palette.ac)
            .padding(.horizontal, 10)
            .frame(height: 28)
            .background(Palette.acSoft, in: .capsule)
    }
}

private struct RowActionStyle: ButtonStyle {
    var quiet = false
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.sans(14, weight: .semibold))
            .foregroundStyle(quiet ? Palette.tx : Palette.on)
            .padding(.horizontal, 14)
            .frame(minHeight: 32)
            .background(quiet ? Palette.canvas : Palette.ac, in: .capsule)
            .opacity(isEnabled ? (configuration.isPressed ? 0.7 : 1) : 0.4)
            .frame(minHeight: 44)
            .contentShape(.rect)
    }
}

/// Set or change the password. Web: Account → Password (`PasswordCard`), same rules.
private struct PasswordSheet: View {
    let onSaved: () -> Void

    @Environment(AuthStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var confirm = ""
    @State private var busy = false
    @State private var error: String?

    /// `minimum_password_length` in supabase/config.toml; the web checks the same.
    private let minimum = 6

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionTitle("Password", size: 22)
            Text("For signing in without waiting for a code.")
                .font(.sans(16)).foregroundStyle(Palette.tx2)
            Field(placeholder: "New password", text: $password, isSecure: true)
                .textContentType(.newPassword)
            Field(placeholder: "Type it again", text: $confirm, isSecure: true)
                .textContentType(.newPassword)
            if let hint { Text(hint).font(.sans(14)).foregroundStyle(Palette.warn) }
            if let error { Notice(text: error, kind: .warn) }
            Button("Save password", action: save)
                .buttonStyle(.primary)
                .disabled(!ready || busy)
            Spacer()
        }
        .padding(20)
        .padding(.top, 8)
        .livholdSheet(detents: [.medium, .large])
    }

    private var ready: Bool { password.count >= minimum && password == confirm }

    private var hint: String? {
        if !password.isEmpty && password.count < minimum { return "At least \(minimum) characters." }
        if !confirm.isEmpty && password != confirm { return "The two don’t match yet." }
        return nil
    }

    private func save() {
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                try await store.setPassword(password)
                onSaved()
                dismiss()
            } catch {
                self.error = AuthStore.message(for: error)
            }
        }
    }
}
