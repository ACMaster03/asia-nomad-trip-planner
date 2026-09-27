import Foundation

// Languages (Patrik, 27 Sep): English is the source, Hungarian the first
// translation. Every string a person reads lives in Localizable.xcstrings:
//
// - A literal handed to Text, Button, Label, a navigation title, or to one of
//   our components (Notice, Chip, CardLabel, …) is a key already.
// - Words built in code use String(localized:), with interpolation, so the
//   translator sees the whole sentence: String(localized: "\(n) nights left").
// - Counts are never pluralised by hand: the catalog holds the one/other forms
//   (Hungarian needs only one after a number).
// - Dates and amounts come from the formatters below, never from word lists.
//
// iOS lists the languages in Settings → Apps → Livhold → Language.

enum L10n {
    /// The language the app runs in: the first of the phone's preferred
    /// languages that the app has ("en", "hu").
    static let language: String = Bundle.main.preferredLocalizations.first ?? "en"

    static var isEnglish: Bool { language.hasPrefix("en") }

    /// The app's language with the phone's region, for dates and numbers.
    static let locale: Locale = {
        var c = Locale.Components(locale: .current)
        c.languageComponents = Locale.Language.Components(identifier: language)
        return Locale(components: c)
    }()
}
