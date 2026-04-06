import Foundation
import Testing

@testable import RelayIOSKit

@MainActor
struct RelayAppModelTests {
  @Test
  func bootstrapLoadsRouteStatusAndPreferredSession() async {
    let now = Date()
    let client = StubRelayAPIClient(
      authState: RelayAuthSessionState(
        authenticated: true,
        configured: true,
        actor: RelayAuthSessionActor(method: .github, provider: .github, userId: "user-1")
      ),
      routeStatus: .ready(kind: .defaultDevice),
      sessionList: RelaySessionListSnapshot(
        items: [
          RelaySessionSummary(id: "session-1", title: "Alpha", workspaceId: "workspace-1", updatedAt: now),
          RelaySessionSummary(id: "session-2", title: "Beta", workspaceId: "workspace-1", updatedAt: now.addingTimeInterval(-10))
        ],
        preferredSessionId: "session-2"
      ),
      sessionsById: [
        "session-2": RelaySessionThread(
          id: "session-2",
          workspaceId: "workspace-1",
          title: "Beta",
          turnCount: 1,
          messages: [],
          createdAt: now,
          updatedAt: now
        )
      ]
    )
    let model = RelayAppModel(
      authController: RelayAuthController(apiClient: client, tokenStore: InMemoryRelaySupabaseTokenStore()),
      apiClient: client
    )

    await model.bootstrap()

    #expect(model.authState.authenticated)
    #expect(model.connectionCard.title == "Connected to your default computer")
    #expect(model.recentSessions.count == 2)
    #expect(model.activeSession?.id == "session-2")
  }

  @Test
  func bootstrapStopsAtRecoveryStateWhenNoUsableDefaultDeviceExists() async {
    let client = StubRelayAPIClient(
      authState: RelayAuthSessionState(
        authenticated: true,
        configured: true,
        actor: RelayAuthSessionActor(method: .github, provider: .github, userId: "user-1")
      ),
      routeStatus: .limited(kind: .needsDefaultDevice)
    )
    let model = RelayAppModel(
      authController: RelayAuthController(apiClient: client, tokenStore: InMemoryRelaySupabaseTokenStore()),
      apiClient: client
    )

    await model.bootstrap()

    #expect(model.recentSessions.isEmpty)
    #expect(model.activeSession == nil)
    #expect(model.connectionCard.title == "No default computer is set yet")
  }

  @Test
  func sendCurrentDraftStreamsAssistantMessageAndRefreshesSession() async {
    let now = Date()
    let streamEvents: [RelayRuntimeEvent] = [
      .runStarted(runId: "run-1", sessionId: "session-1", createdAt: now),
      .messageDelta(runId: "run-1", messageId: "assistant-1", delta: "Hel", createdAt: now),
      .messageDelta(runId: "run-1", messageId: "assistant-1", delta: "lo", createdAt: now.addingTimeInterval(1)),
      .messageCompleted(runId: "run-1", messageId: "assistant-1", createdAt: now.addingTimeInterval(2)),
      .runCompleted(runId: "run-1", sessionId: "session-1", createdAt: now.addingTimeInterval(3)),
      .threadUpdated(sessionId: "session-1", workspaceId: "workspace-1", createdAt: now.addingTimeInterval(4)),
    ]
    let refreshedThread = RelaySessionThread(
      id: "session-1",
      workspaceId: "workspace-1",
      title: "Alpha",
      turnCount: 2,
      messages: [
        RelayMessage(
          id: "assistant-1",
          sessionId: "session-1",
          role: .assistant,
          content: "Hello",
          status: .completed,
          createdAt: now,
          updatedAt: now.addingTimeInterval(4)
        )
      ],
      createdAt: now,
      updatedAt: now.addingTimeInterval(4)
    )
    let client = StubRelayAPIClient(
      authState: RelayAuthSessionState(
        authenticated: true,
        configured: true,
        actor: RelayAuthSessionActor(method: .github, provider: .github, userId: "user-1")
      ),
      routeStatus: .ready(kind: .defaultDevice),
      sessionList: RelaySessionListSnapshot(
        items: [RelaySessionSummary(id: "session-1", title: "Alpha", workspaceId: "workspace-1", updatedAt: now)],
        preferredSessionId: "session-1"
      ),
      sessionsById: ["session-1": refreshedThread],
      runtimeEvents: streamEvents
    )
    let model = RelayAppModel(
      authController: RelayAuthController(apiClient: client, tokenStore: InMemoryRelaySupabaseTokenStore()),
      apiClient: client,
      authState: client.authState,
      routeStatus: .ready(kind: .defaultDevice),
      recentSessions: client.sessionList.items,
      activeSession: RelaySessionThread(
        id: "session-1",
        workspaceId: "workspace-1",
        title: "Alpha",
        turnCount: 1,
        messages: [],
        createdAt: now,
        updatedAt: now
      )
    )
    model.draftMessage = "Hello"

    await model.sendCurrentDraft()

    #expect(model.draftMessage.isEmpty)
    #expect(model.activeSession?.messages.last?.content == "Hello")
    #expect(model.activeSession?.messages.last?.status == .completed)
  }

  @Test
  func completeGitHubSignInRegistersSupabaseSessionAndLoadsRelayState() async throws {
    let now = Date()
    let client = StubRelayAPIClient(
      authState: RelayAuthSessionState(
        authenticated: true,
        configured: true,
        actor: RelayAuthSessionActor(method: .github, provider: .github, userId: "user-1")
      ),
      routeStatus: .ready(kind: .defaultDevice),
      sessionList: RelaySessionListSnapshot(
        items: [RelaySessionSummary(id: "session-1", title: "Alpha", workspaceId: "workspace-1", updatedAt: now)],
        preferredSessionId: "session-1"
      ),
      sessionsById: [
        "session-1": RelaySessionThread(
          id: "session-1",
          workspaceId: "workspace-1",
          title: "Alpha",
          turnCount: 1,
          messages: [],
          createdAt: now,
          updatedAt: now
        )
      ]
    )
    let model = RelayAppModel(
      authController: RelayAuthController(apiClient: client, tokenStore: InMemoryRelaySupabaseTokenStore()),
      apiClient: client
    )

    await model.completeGitHubSignIn(
      callbackURL: try #require(URL(string: "relayios://auth/callback?access_token=token-a&refresh_token=token-b"))
    )

    #expect(model.authState.authenticated)
    #expect(model.connectionCard.title == "Connected to your default computer")
    #expect(model.recentSessions.count == 1)
    #expect(model.activeSession?.id == "session-1")
  }
}
