import SwiftUI

/// The iOS Account screen, for now only the parts sign-in needs: who you are,
/// Sign-in methods, and signing out. The rest of the web's Account page follows
/// with the real screens.
struct AccountView: View {
    @Environment(AuthStore.self) private var store

    var body: some View {
        List {
            Section {
                LabeledContent("Signed in as", value: store.email ?? "—")
                NavigationLink("Sign-in methods") { SignInMethodsView() }
            }
            Section {
                Button("Sign out", role: .destructive) {
                    Task { await store.signOut() }
                }
            } footer: {
                Text("Signs out this iPhone only. Your other devices stay signed in.")
            }
        }
        .font(.sans(16))
        .scrollContentBackground(.hidden)
        .background(Palette.canvas.ignoresSafeArea())
        .navigationTitle("Account")
    }
}
