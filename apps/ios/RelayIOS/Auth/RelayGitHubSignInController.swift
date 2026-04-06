import AuthenticationServices
import Foundation
import UIKit

@MainActor
final class RelayGitHubSignInController: NSObject, ASWebAuthenticationPresentationContextProviding {
  static let callbackScheme = "relayios"
  static let defaultCallbackURL = "relayios://auth/callback"

  private let baseURL: URL
  private var session: ASWebAuthenticationSession?

  init(baseURL: URL) {
    self.baseURL = baseURL
  }

  func signIn() async throws -> URL {
    let startURL = makeStartURL()

    return try await withCheckedThrowingContinuation { continuation in
      let session = ASWebAuthenticationSession(url: startURL, callbackURLScheme: Self.callbackScheme) {
        [weak self] callbackURL, error in
        self?.session = nil

        if let error {
          continuation.resume(throwing: error)
          return
        }

        guard let callbackURL else {
          continuation.resume(throwing: RelayGitHubSignInError.missingCallbackURL)
          return
        }

        continuation.resume(returning: callbackURL)
      }

      session.presentationContextProvider = self
      session.prefersEphemeralWebBrowserSession = false
      self.session = session

      if !session.start() {
        self.session = nil
        continuation.resume(throwing: RelayGitHubSignInError.unableToStart)
      }
    }
  }

  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first(where: \.isKeyWindow)
      ?? ASPresentationAnchor()
  }

  private func makeStartURL() -> URL {
    var components = URLComponents(
      url: baseURL.appending(path: "/auth/ios"),
      resolvingAgainstBaseURL: false
    )
    components?.queryItems = [
      URLQueryItem(name: "app_callback", value: Self.defaultCallbackURL),
    ]

    return components?.url ?? baseURL
  }
}

enum RelayGitHubSignInError: LocalizedError {
  case missingCallbackURL
  case unableToStart

  var errorDescription: String? {
    switch self {
    case .missingCallbackURL:
      return "GitHub sign-in finished, but Relay did not receive the app callback."
    case .unableToStart:
      return "Relay could not start the GitHub sign-in flow."
    }
  }
}
