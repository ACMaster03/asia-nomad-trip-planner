import SwiftUI

/// The iOS Account screen, for now only the parts sign-in and the spine need: who
/// you are, Sign-in methods, the look, and signing out. The rest of the web's
/// Account page follows with the real screens.
struct AccountView: View {
    @Environment(AuthStore.self) private var store
    @AppStorage("appearance") private var appearance: Appearance = .system

    var body: some View {
        List {
            Section {
                LabeledContent("Signed in as", value: store.email ?? "—")
                NavigationLink("Sign-in methods", value: Route.signInMethods)
            }
            Section {
                Picker("Appearance", selection: $appearance) {
                    ForEach(Appearance.allCases) { Text($0.title).tag($0) }
                }
                NavigationLink("Design gallery", value: Route.gallery)
            } header: {
                Text("Look")
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
