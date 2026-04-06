import Foundation

public actor RelayAuthController: Sendable {
  private let apiClient: any RelayAPIClient
  private let tokenStore: any RelaySupabaseTokenStore

  public init(apiClient: any RelayAPIClient, tokenStore: any RelaySupabaseTokenStore) {
    self.apiClient = apiClient
    self.tokenStore = tokenStore
  }

  public func restoreSession() async throws -> RelayAuthSessionState {
    if let tokens = try await tokenStore.loadTokens() {
      do {
        return try await apiClient.registerSupabaseSession(tokens)
      } catch RelayAPIClientError.unauthorized {
        try await tokenStore.clearTokens()
      }
    }

    return try await apiClient.loadAuthSession()
  }

  public func completeSignIn(with tokens: RelaySupabaseSessionTokens) async throws -> RelayAuthSessionState {
    try await tokenStore.saveTokens(tokens)

    do {
      return try await apiClient.registerSupabaseSession(tokens)
    } catch {
      try await tokenStore.clearTokens()
      throw error
    }
  }

  public func signOut() async throws {
    do {
      try await apiClient.logout()
    } catch {
      try await tokenStore.clearTokens()
      throw error
    }

    try await tokenStore.clearTokens()
  }
}
