import Foundation
import Supabase

/// Which Supabase project the app talks to: production, in every build. Debug builds
/// used staging until it was paused on 25 Oct 2026 (CLAUDE.md, "The database:
/// production only"), so a Debug build signed in acts on real accounts: do UI work on
/// the fixtures (-tripFixture YES -skipSignIn YES -followFixture YES) and sign in for
/// real only to look.
///
/// Both keys are the projects' PUBLISHABLE keys: public by design, shipped in the
/// web bundle too. Row-Level Security is the boundary, not their secrecy. Never put
/// a secret / service_role key in this app.
enum Backend {
    struct Project: Sendable {
        let name: String
        let url: URL
        let publishableKey: String
        /// The web app this project's emails point at — where a password reset lands.
        let web: URL
    }

    static let staging = Project(
        name: "staging",
        url: URL(string: "https://fdcncqnklscbztcydtye.supabase.co")!,
        publishableKey: "sb_publishable_PTDgRPVNIEL60q1g6EzKsg_vDeMd-ys",
        // staging's site_url in supabase/config.toml: its links open a dev server.
        web: URL(string: "http://localhost:3000")!
    )

    static let production = Project(
        name: "production",
        url: URL(string: "https://wvmnudcwcqktcugouqoe.supabase.co")!,
        publishableKey: "sb_publishable_pcw3QkiZLZHya71h17hr4w_R5ox4oRO",
        web: URL(string: "https://www.livhold.com")!
    )

    static let current = production

    /// One client for the whole app. The session is kept in the Keychain by the SDK
    /// and refreshed automatically, so a traveller stays signed in across launches.
    static let client = SupabaseClient(
        supabaseURL: current.url,
        supabaseKey: current.publishableKey,
        options: .init(
            auth: .init(emitLocalSessionAsInitialSession: true),
            global: .init(session: session)
        )
    )

    /// Tuned for travellers' connections. With no network at all a request waits for
    /// one instead of failing at once (`waitsForConnectivity`); once sent, a stalled
    /// request gives up after 30 s rather than the default 60, and nothing waits
    /// longer than two minutes in total.
    private static let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.waitsForConnectivity = true
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 120
        return URLSession(configuration: config)
    }()
}
