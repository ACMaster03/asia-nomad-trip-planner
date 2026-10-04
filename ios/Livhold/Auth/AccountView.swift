import SwiftUI

/// The iOS Account screen, split the way Patrik agreed on 29 Sep: the journey's
/// settings behind one row, then what belongs to you on every journey.
struct AccountView: View {
    @Environment(AuthStore.self) private var store
    @Environment(TripStore.self) private var trips
    @AppStorage("appearance") private var appearance: Appearance = .system
    @State private var trackingError: String?

    var body: some View {
        List {
            Section {
                LabeledContent("Signed in as", value: store.email ?? "—")
                NavigationLink("Sign-in methods", value: Route.signInMethods)
            }
            if let trip = trips.trip {
                Section {
                    NavigationLink(value: Route.tripSettings) {
                        LabeledContent("Trip settings", value: trip.state.meta.tripName ?? trip.name ?? "")
                    }
                } header: {
                    Text("This journey")
                } footer: {
                    Text("Name, dates, home, the budget and exchange rates.")
                }
            }
            Section {
                Toggle("Track spending", isOn: Binding(
                    get: { trips.tracking == .yes },
                    set: { on in Task { do { try await trips.setTracking(on); trackingError = nil } catch { trackingError = error.localizedDescription } } }
                ))
                .tint(Palette.ac)
                .disabled(trips.tracking == .unknown)
                Picker("Appearance", selection: $appearance) {
                    ForEach(Appearance.allCases) { Text($0.title).tag($0) }
                }
                NavigationLink("Design gallery", value: Route.gallery)
            } header: {
                Text("You")
            } footer: {
                if let trackingError {
                    Text(trackingError).foregroundStyle(Palette.warn)
                } else {
                    Text("Tracking shows your daily pace, where it goes and the projection on Money, on every journey. Bookings show either way.")
                }
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
        .task { await trips.refreshTracking() }
    }
}
