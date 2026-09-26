import SwiftUI

@main
struct LivholdApp: App {
    @AppStorage("appearance") private var appearance: Appearance = .system
    @State private var auth = AuthStore()

    init() {
        Typography.registerFonts()
    }

    var body: some Scene {
        WindowGroup {
            RootView(appearance: $appearance)
                .environment(auth)
                .task { await auth.start() }
                .preferredColorScheme(appearance.colorScheme)
                .tint(Palette.ac)
        }
    }
}

/// Signed out → the way in; signed in → the app. While the Keychain is read on
/// launch, only the canvas shows, so a signed-in traveller never sees sign-in flash.
private struct RootView: View {
    @Binding var appearance: Appearance
    @Environment(AuthStore.self) private var auth

    var body: some View {
        Group {
            switch auth.phase {
            case .restoring:
                Palette.canvas.ignoresSafeArea()
            case .signedOut:
                SignInView()
                    .transition(.opacity)
            case .signedIn:
                // The gallery is the whole app until the first real screens land; it stays
                // afterwards behind a debug entry point, like the web's /dev preview routes.
                NavigationStack {
                    GalleryView(appearance: $appearance)
                        .toolbar {
                            ToolbarItem(placement: .topBarTrailing) {
                                NavigationLink { AccountView() } label: {
                                    Image(systemName: "person.crop.circle").accessibilityLabel("Account")
                                }
                            }
                        }
                        .toolbarBackground(Palette.canvas, for: .navigationBar)
                }
                .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.25), value: auth.phase)
    }
}

/// Mirrors the web theme setting (light / dark / system → `data-theme`).
enum Appearance: String, CaseIterable, Identifiable {
    case system, light, dark
    var id: Self { self }
    var title: String { rawValue.capitalized }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}
