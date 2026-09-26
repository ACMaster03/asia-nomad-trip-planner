import CoreText
import SwiftUI
import UIKit

/// Lora for headings, Work Sans for everything else, figures tabular — the web's
/// type system. Sizes are the web's px values; `relativeTo` lets Dynamic Type scale
/// them the way the web's "Larger text" setting does.
///
/// The font files live in `Livhold/Fonts/` and are registered at launch. Until they
/// are added, headings fall back to New York (the system serif) and body text to
/// SF Pro, so every screen still renders.
enum Typography {
    /// Registers every .ttf/.otf in the bundle. Call once, before the first view.
    static func registerFonts() {
        let urls = ["ttf", "otf"].flatMap { Bundle.main.urls(forResourcesWithExtension: $0, subdirectory: nil) ?? [] }
        for url in urls {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }

    static func isAvailable(_ family: String) -> Bool {
        !UIFont.fontNames(forFamilyName: family).isEmpty
    }
}

extension Font {
    /// Lora — `h1–h3` and display figures on the web (`font-serif … font-semibold`).
    static func serif(_ size: CGFloat, weight: Font.Weight = .semibold, relativeTo style: Font.TextStyle = .title3) -> Font {
        if Typography.isAvailable(FontFamily.serif) {
            return .custom(FontFamily.serif, size: size, relativeTo: style).weight(weight)
        }
        return .system(size: size, weight: weight, design: .serif)
    }

    /// Work Sans — body, controls, labels. Figures tabular, as on the web.
    /// Only here: `monospacedDigit` on Lora also widens its word spaces.
    static func sans(_ size: CGFloat = 16, weight: Font.Weight = .regular, relativeTo style: Font.TextStyle = .body) -> Font {
        if Typography.isAvailable(FontFamily.sans) {
            return .custom(FontFamily.sans, size: size, relativeTo: style).weight(weight).monospacedDigit()
        }
        return .system(size: size, weight: weight).monospacedDigit()
    }
}

extension View {
    /// Body defaults, mirroring `body { font-family: sans; font-variant-numeric: tabular-nums }`.
    func livholdText() -> some View {
        font(.sans()).foregroundStyle(Palette.tx)
    }
}
