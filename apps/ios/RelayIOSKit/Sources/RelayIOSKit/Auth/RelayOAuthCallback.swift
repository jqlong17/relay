import Foundation

public struct RelayOAuthCallbackPayload: Equatable, Sendable {
  public let accessToken: String
  public let refreshToken: String

  public init(url: URL) throws {
    guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
      throw RelayOAuthCallbackError.invalidCallback
    }

    let queryItems = components.queryItems ?? []
    let errorCode = queryItems.first(where: { $0.name == "error" })?.value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let errorDescription = queryItems.first(where: { $0.name == "error_description" })?.value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

    if !errorCode.isEmpty || !errorDescription.isEmpty {
      throw RelayOAuthCallbackError.oauthFailed(
        message: errorDescription.isEmpty ? errorCode : errorDescription
      )
    }

    let accessToken = queryItems.first(where: { $0.name == "access_token" })?.value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let refreshToken = queryItems.first(where: { $0.name == "refresh_token" })?.value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

    guard !accessToken.isEmpty, !refreshToken.isEmpty else {
      throw RelayOAuthCallbackError.missingTokens
    }

    self.accessToken = accessToken
    self.refreshToken = refreshToken
  }
}

public enum RelayOAuthCallbackError: LocalizedError, Equatable, Sendable {
  case invalidCallback
  case missingTokens
  case oauthFailed(message: String)

  public var errorDescription: String? {
    switch self {
    case .invalidCallback:
      return "Relay returned an invalid sign-in callback."
    case .missingTokens:
      return "GitHub sign-in completed, but Relay did not receive the Supabase session."
    case let .oauthFailed(message):
      return message
    }
  }
}
