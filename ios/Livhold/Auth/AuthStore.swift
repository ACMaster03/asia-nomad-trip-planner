import AuthenticationServices
import CryptoKit
import Foundation
import Observation
import Supabase

/// The app's single source of truth for "who is signed in", and every way in:
/// Sign in with Apple, an emailed code, and a password — the three the web and
/// the iOS mock agreed on (2026-09-26). Screens call these and read `session`;
/// they never talk to Supabase Auth directly.
@MainActor
@Observable
final class AuthStore {
    enum Phase: Equatable {
        /// Reading the Keychain on launch — show nothing yet, not the sign-in screen.
        case restoring
        case signedOut
        case signedIn
    }

    private(set) var phase: Phase = .restoring
    private(set) var session: Session?

    private let auth: AuthClient
    /// The raw nonce of the Apple request in flight. Apple gets its SHA-256; Supabase
    /// gets the raw value and checks the two match, so a stolen identity token cannot
    /// be replayed.
    private var appleNonce: String?

    init(auth: AuthClient = Backend.client.auth) {
        self.auth = auth
    }

    /// Follows the SDK's session events for the life of the app: the initial
    /// Keychain session, sign-ins, token refreshes and sign-outs — including a
    /// session ended elsewhere (the nightly idle purge, migration 42).
    func start() async {
        for await (_, session) in auth.authStateChanges {
            self.session = session
            phase = (session == nil || session?.isExpired == true) ? .signedOut : .signedIn
        }
    }

    // MARK: Sign in with Apple

    /// Hand this to `SignInWithAppleButton(onRequest:)`.
    func prepare(_ request: ASAuthorizationAppleIDRequest) {
        let nonce = Self.randomNonce()
        appleNonce = nonce
        request.requestedScopes = [.fullName, .email]
        request.nonce = Self.sha256(nonce)
    }

    /// Hand the button's result here. Signs in, creating the account on first use.
    func signInWithApple(_ result: Result<ASAuthorization, Error>) async throws {
        let (token, name) = try appleToken(from: result)
        _ = try await auth.signInWithIdToken(
            credentials: .init(provider: .apple, idToken: token, nonce: appleNonce)
        )
        await saveFirstNameIfMissing(name)
    }

    /// Attaches an Apple ID to the account that is already signed in (Account →
    /// Sign-in methods). This is what stops "Hide My Email" from creating a second,
    /// empty account. Needs `enable_manual_linking` in supabase/config.toml.
    func connectApple(_ result: Result<ASAuthorization, Error>) async throws {
        let (token, _) = try appleToken(from: result)
        _ = try await auth.linkIdentityWithIdToken(
            credentials: .init(provider: .apple, idToken: token, nonce: appleNonce)
        )
    }

    // MARK: Email code

    /// Emails an 8-digit code (and the web's link). Creates the account if the
    /// address is new, exactly like the web's magic link.
    func sendCode(to email: String) async throws {
        try await auth.signInWithOTP(email: Self.normalized(email), shouldCreateUser: true)
    }

    func verify(code: String, email: String) async throws {
        let digits = code.filter(\.isNumber)
        _ = try await auth.verifyOTP(email: Self.normalized(email), token: digits, type: .email)
    }

    // MARK: Password

    func signIn(email: String, password: String) async throws {
        _ = try await auth.signIn(email: Self.normalized(email), password: password)
    }

    /// The web's reset email; the link finishes on the web's Account page, as there.
    func sendPasswordReset(to email: String) async throws {
        var next = URLComponents(url: Backend.current.web.appending(path: "auth/callback"), resolvingAgainstBaseURL: false)!
        next.queryItems = [URLQueryItem(name: "next", value: "/account")]
        try await auth.resetPasswordForEmail(Self.normalized(email), redirectTo: next.url)
    }

    /// Sets or changes the password of the signed-in account (Account → Sign-in methods).
    func setPassword(_ password: String) async throws {
        _ = try await auth.update(user: UserAttributes(password: password))
    }

    // MARK: Account

    /// Signs out THIS device only; the traveller's other devices stay signed in.
    func signOut() async {
        try? await auth.signOut(scope: .local)
    }

    var email: String? { session?.user.email }

    func identities() async throws -> [UserIdentity] {
        try await auth.userIdentities()
    }

    func disconnect(_ identity: UserIdentity) async throws {
        try await auth.unlinkIdentity(identity)
    }

    // MARK: -

    private func appleToken(from result: Result<ASAuthorization, Error>) throws -> (String, PersonNameComponents?) {
        let authorization = try result.get()
        guard
            let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
            let data = credential.identityToken,
            let token = String(data: data, encoding: .utf8)
        else { throw AuthFailure.appleTokenMissing }
        return (token, credential.fullName)
    }

    /// Apple sends the name only on the very first sign-in, ever. The web shows
    /// `user_metadata.first_name` to people you plan with, so keep it if we get it.
    private func saveFirstNameIfMissing(_ name: PersonNameComponents?) async {
        guard let first = name?.givenName, !first.isEmpty,
              auth.currentUser?.userMetadata["first_name"] == nil
        else { return }
        _ = try? await auth.update(user: UserAttributes(data: ["first_name": .string(first)]))
    }

    private static func normalized(_ email: String) -> String {
        email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private static func randomNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var generator = SystemRandomNumberGenerator()
        return String((0..<length).map { _ in charset.randomElement(using: &generator)! })
    }

    private static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

enum AuthFailure: LocalizedError {
    case appleTokenMissing

    var errorDescription: String? {
        switch self {
        case .appleTokenMissing: "Apple didn’t send a sign-in token. Please try again."
        }
    }
}

extension AuthStore {
    /// Words for an error, in the web's voice (lib/auth/authError.ts). `nil` means
    /// say nothing — the person cancelled the Apple sheet themselves.
    static func message(for error: Error) -> String? {
        if let apple = error as? ASAuthorizationError, apple.code == .canceled { return nil }
        if let auth = error as? AuthError {
            switch auth.errorCode {
            case .invalidCredentials: return "That email and password don’t match. Check both, or sign in with a code instead."
            case .otpExpired: return "That code didn’t work. It may be mistyped, used already, or older than an hour — check it, or ask for a new one."
            case .overEmailSendRateLimit, .overRequestRateLimit: return "Too many tries just now. Wait a minute, then try again."
            case .weakPassword: return "That password is too short — use at least 6 characters."
            case .samePassword: return "That’s already your password."
            case .validationFailed: return "That doesn’t look like an email address."
            case .emailNotConfirmed: return "Confirm your email first — use the code or link we sent."
            case .identityAlreadyExists: return "That Apple ID already belongs to another Livhold account."
            case .singleIdentityNotDeletable: return "This is your only way in, so it can’t be removed."
            case .manualLinkingDisabled: return "Connecting Apple isn’t switched on yet."
            default: break
            }
        }
        if (error as? URLError) != nil { return "No connection. Check your internet and try again." }
        return "Something went wrong signing in. Please try again in a moment."
    }
}
