import Testing

@testable import RelayIOSKit

struct RelayAuthControllerTests {
  @Test
  func restoresSavedSupabaseSessionBeforeFallingBackToAnonymousSession() async throws {
    let store = InMemoryRelaySupabaseTokenStore(
      tokens: RelaySupabaseSessionTokens(accessToken: "token-a", refreshToken: "token-b")
    )
    let client = StubRelayAPIClient(
      authState: RelayAuthSessionState(
        authenticated: true,
        configured: true,
        actor: RelayAuthSessionActor(method: .github, provider: .github, userId: "user-1")
      )
    )
    let controller = RelayAuthController(apiClient: client, tokenStore: store)

    let restored = try await controller.restoreSession()

    #expect(restored.authenticated)
    #expect(restored.actor?.userId == "user-1")
  }

  @Test
  func clearsSavedTokensWhenRemoteSessionBecomesUnauthorized() async throws {
    let store = InMemoryRelaySupabaseTokenStore(
      tokens: RelaySupabaseSessionTokens(accessToken: "expired", refreshToken: "expired")
    )
    let client = ExpiringAuthAPIClient()
    let controller = RelayAuthController(apiClient: client, tokenStore: store)

    let restored = try await controller.restoreSession()

    #expect(restored.authenticated == false)
    #expect(try await store.loadTokens() == nil)
  }
}

private struct ExpiringAuthAPIClient: RelayAPIClient {
  func loadAuthSession() async throws -> RelayAuthSessionState {
    .signedOut
  }

  func registerSupabaseSession(_ tokens: RelaySupabaseSessionTokens) async throws -> RelayAuthSessionState {
    throw RelayAPIClientError.unauthorized
  }

  func logout() async throws {}
  func loadRouteStatus() async throws -> RelayRouteStatus { .unavailable(kind: .sessionExpired) }
  func loadSessionList(fresh: Bool) async throws -> RelaySessionListSnapshot { .init(items: [], preferredSessionId: nil) }
  func loadSession(id: String, fresh: Bool) async throws -> RelaySessionThread { throw RelayAPIClientError.requestFailed("unused") }
  func sendMessage(sessionId: String, content: String) async throws -> [RelayRuntimeEvent] { [] }
  func sendMessageStream(sessionId: String, content: String) async throws -> AsyncThrowingStream<RelayRuntimeEvent, Error> {
    AsyncThrowingStream { continuation in
      continuation.finish()
    }
  }
  func subscribeRuntimeEvents(sessionId: String?, workspaceId: String?) async throws -> AsyncThrowingStream<RelayRuntimeEvent, Error> {
    AsyncThrowingStream { continuation in
      continuation.finish()
    }
  }
}
