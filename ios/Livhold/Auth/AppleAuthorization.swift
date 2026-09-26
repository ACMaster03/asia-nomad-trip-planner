import AuthenticationServices
import UIKit

/// Runs the Apple sheet from any control, not just `SignInWithAppleButton` — for the
/// "Connect" pill in Account → Sign-in methods. Returns the same `Result` the button
/// hands its `onCompletion`, so AuthStore takes both unchanged.
@MainActor
final class AppleAuthorization: NSObject, ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding {
    private var continuation: CheckedContinuation<Result<ASAuthorization, Error>, Never>?
    private var controller: ASAuthorizationController?

    static func run(prepare: (ASAuthorizationAppleIDRequest) -> Void) async -> Result<ASAuthorization, Error> {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        prepare(request)
        let runner = AppleAuthorization()
        let result = await withCheckedContinuation { continuation in
            runner.continuation = continuation
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = runner
            controller.presentationContextProvider = runner
            runner.controller = controller
            controller.performRequests()
        }
        // The controller holds its delegate weakly: keep both alive until Apple answers.
        withExtendedLifetime(runner) {}
        return result
    }

    nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        MainActor.assumeIsolated { finish(.success(authorization)) }
    }

    nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        MainActor.assumeIsolated { finish(.failure(error)) }
    }

    nonisolated func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            return scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? ASPresentationAnchor()
        }
    }

    private func finish(_ result: Result<ASAuthorization, Error>) {
        continuation?.resume(returning: result)
        continuation = nil
        controller = nil
    }
}
