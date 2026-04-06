import Foundation

public struct RelayAuthSessionState: Codable, Equatable, Sendable {
  public let authenticated: Bool
  public let configured: Bool
  public let actor: RelayAuthSessionActor?

  public init(authenticated: Bool, configured: Bool, actor: RelayAuthSessionActor?) {
    self.authenticated = authenticated
    self.configured = configured
    self.actor = actor
  }

  public static let signedOut = RelayAuthSessionState(
    authenticated: false,
    configured: false,
    actor: nil
  )
}

public struct RelayAuthSessionActor: Codable, Equatable, Sendable {
  public enum Method: String, Codable, Sendable {
    case password
    case github
  }

  public let method: Method?
  public let provider: Method?
  public let userId: String?

  public init(method: Method?, provider: Method?, userId: String?) {
    self.method = method
    self.provider = provider
    self.userId = userId
  }
}
