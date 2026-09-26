import Foundation
import Supabase

/// Which Supabase project the app talks to. Debug builds (Xcode, simulator) use
/// staging; Release builds (TestFlight, App Store) use production — the same split
/// the web has between its preview and live deployments.
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

    #if DEBUG
    static let current = staging
    #else
    static let current = production
    #endif

    /// One client for the whole app. The session is kept in the Keychain by the SDK
    /// and refreshed automatically, so a traveller stays signed in across launches.
    static let client = SupabaseClient(
        supabaseURL: current.url,
        supabaseKey: current.publishableKey,
        options: .init(auth: .init(emitLocalSessionAsInitialSession: true))
    )
}
