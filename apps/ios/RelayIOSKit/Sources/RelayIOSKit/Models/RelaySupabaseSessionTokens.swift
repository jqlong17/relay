import Foundation

public struct RelaySupabaseSessionTokens: Codable, Equatable, Sendable {
  public let accessToken: String
  public let refreshToken: String

  public init(accessToken: String, refreshToken: String) {
    self.accessToken = accessToken
    self.refreshToken = refreshToken
  }
}
