import SwiftUI
import UIKit

/// An sRGB colour as the token file writes it: 0–255 channels, 0–1 alpha.
struct RGBA: Sendable {
    let r: Double, g: Double, b: Double, a: Double

    init(_ r: Double, _ g: Double, _ b: Double, _ a: Double = 1) {
        self.r = r; self.g = g; self.b = b; self.a = a
    }

    var uiColor: UIColor { UIColor(red: r / 255, green: g / 255, blue: b / 255, alpha: a) }
}

extension Color {
    /// A colour that follows the resolved appearance, the way the web tokens follow
    /// `data-theme`. `.preferredColorScheme` on the root switches every token at once.
    init(light: RGBA, dark: RGBA) {
        self.init(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark ? dark.uiColor : light.uiColor
        })
    }
}

/// A landscape wash (web `--washLogin`, `--washLight`): the image anchored to the
/// bottom and cropped to fill, over its base colour.
struct WashStyle: Sendable {
    let image: String
    let base: Color
}

extension View {
    func wash(_ style: WashStyle) -> some View {
        background {
            style.base
                .overlay(alignment: .bottom) {
                    Image(style.image).resizable().scaledToFill()
                }
                .clipped()
                .ignoresSafeArea()
        }
    }
}
