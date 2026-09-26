import SwiftUI

@main
struct LivholdApp: App {
    @AppStorage("appearance") private var appearance: Appearance = .system

    init() {
        Typography.registerFonts()
    }

    var body: some Scene {
        WindowGroup {
            // The gallery is the whole app until the first real screens land; it stays
            // afterwards behind a debug entry point, like the web's /dev preview routes.
            GalleryView(appearance: $appearance)
                .preferredColorScheme(appearance.colorScheme)
                .tint(Palette.ac)
        }
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
