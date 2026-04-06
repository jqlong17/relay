import Foundation
import Observation

@MainActor
@Observable
public final class RelayAppModel {
  public private(set) var authState: RelayAuthSessionState
  public private(set) var routeStatus: RelayRouteStatus
  public private(set) var connectionCard: RelayConnectionCard
  public private(set) var recentSessions: [RelaySessionSummary]
  public private(set) var activeSession: RelaySessionThread?
  public private(set) var isBootstrapping: Bool
  public private(set) var isRefreshing: Bool
  public private(set) var isSending: Bool
  public private(set) var errorMessage: String?
  public var draftMessage: String

  private let authController: RelayAuthController
  private let apiClient: any RelayAPIClient
  private var selectedSessionId: String?

  public init(
    authController: RelayAuthController,
    apiClient: any RelayAPIClient,
    authState: RelayAuthSessionState = .signedOut,
    routeStatus: RelayRouteStatus = .unavailable(kind: .sessionExpired),
    recentSessions: [RelaySessionSummary] = [],
    activeSession: RelaySessionThread? = nil
  ) {
    self.authController = authController
    self.apiClient = apiClient
    self.authState = authState
    self.routeStatus = routeStatus
    self.connectionCard = RelayConnectionCardMapper.makeCard(for: routeStatus)
    self.recentSessions = recentSessions
    self.activeSession = activeSession
    self.isBootstrapping = false
    self.isRefreshing = false
    self.isSending = false
    self.errorMessage = nil
    self.draftMessage = ""
    self.selectedSessionId = activeSession?.id
  }

  public func bootstrap() async {
    isBootstrapping = true
    errorMessage = nil
    defer { isBootstrapping = false }

    do {
      authState = try await authController.restoreSession()
      try await refreshRelayState(preferFreshSession: false)
    } catch {
      authState = .signedOut
      routeStatus = .unavailable(kind: .sessionExpired)
      connectionCard = RelayConnectionCardMapper.makeCard(for: routeStatus)
      errorMessage = error.localizedDescription
    }
  }

  public func completeGitHubSignIn(callbackURL: URL) async {
    isBootstrapping = true
    errorMessage = nil
    defer { isBootstrapping = false }

    do {
      let callback = try RelayOAuthCallbackPayload(url: callbackURL)
      authState = try await authController.completeSignIn(
        with: RelaySupabaseSessionTokens(
          accessToken: callback.accessToken,
          refreshToken: callback.refreshToken
        )
      )
      try await refreshRelayState(preferFreshSession: true)
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  public func presentError(_ error: Error) {
    errorMessage = error.localizedDescription
  }

  public func signOut() async {
    isRefreshing = true
    defer { isRefreshing = false }

    do {
      try await authController.signOut()
    } catch {
      errorMessage = error.localizedDescription
    }

    authState = .signedOut
    routeStatus = .unavailable(kind: .sessionExpired)
    connectionCard = RelayConnectionCardMapper.makeCard(for: routeStatus)
    recentSessions = []
    activeSession = nil
    selectedSessionId = nil
    draftMessage = ""
  }

  public func refresh() async {
    isRefreshing = true
    errorMessage = nil
    defer { isRefreshing = false }

    do {
      try await refreshRelayState(preferFreshSession: true)
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  public func selectSession(id: String) async {
    selectedSessionId = id
    errorMessage = nil

    do {
      activeSession = try await apiClient.loadSession(id: id, fresh: true)
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  public func sendCurrentDraft() async {
    let content = draftMessage.trimmingCharacters(in: .whitespacesAndNewlines)

    guard !content.isEmpty else {
      return
    }

    guard let currentSessionId = activeSession?.id else {
      errorMessage = "Select a Relay session before sending a message."
      return
    }

    isSending = true
    errorMessage = nil
    let submittedText = content
    draftMessage = ""

    appendLocalUserMessage(sessionId: currentSessionId, content: submittedText)
    defer { isSending = false }

    var shouldRefreshAfterStream = false

    do {
      for try await event in try await apiClient.sendMessageStream(sessionId: currentSessionId, content: submittedText) {
        apply(event: event, sessionId: currentSessionId)

        switch event {
        case .threadUpdated, .threadListChanged, .runCompleted:
          shouldRefreshAfterStream = true
        default:
          break
        }
      }

      if shouldRefreshAfterStream {
        activeSession = try await apiClient.loadSession(id: currentSessionId, fresh: true)
        let snapshot = try await apiClient.loadSessionList(fresh: true)
        recentSessions = snapshot.items
      }
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  private func refreshRelayState(preferFreshSession: Bool) async throws {
    if !authState.authenticated {
      routeStatus = .unavailable(kind: .sessionExpired)
      connectionCard = RelayConnectionCardMapper.makeCard(for: routeStatus)
      recentSessions = []
      activeSession = nil
      selectedSessionId = nil
      return
    }

    routeStatus = try await apiClient.loadRouteStatus()
    connectionCard = RelayConnectionCardMapper.makeCard(for: routeStatus)

    guard routeStatus.canLoadSessions else {
      recentSessions = []
      activeSession = nil
      selectedSessionId = nil
      return
    }

    let listSnapshot = try await apiClient.loadSessionList(fresh: preferFreshSession)
    recentSessions = listSnapshot.items
    let nextSessionId = selectedSessionId ?? listSnapshot.preferredSessionId ?? listSnapshot.items.first?.id
    selectedSessionId = nextSessionId

    if let nextSessionId {
      activeSession = try await apiClient.loadSession(id: nextSessionId, fresh: preferFreshSession)
    } else {
      activeSession = nil
    }
  }

  private func appendLocalUserMessage(sessionId: String, content: String) {
    guard var session = activeSession else {
      return
    }

    let now = Date()
    session.messages.append(
      RelayMessage(
        id: "local-user-\(UUID().uuidString)",
        sessionId: sessionId,
        role: .user,
        content: content,
        status: .completed,
        createdAt: now,
        updatedAt: now
      )
    )
    activeSession = session
  }

  private func apply(event: RelayRuntimeEvent, sessionId: String) {
    guard var session = activeSession else {
      return
    }

    switch event {
    case let .messageDelta(_, messageId, delta, createdAt):
      if let index = session.messages.firstIndex(where: { $0.id == messageId }) {
        let existing = session.messages[index]
        session.messages[index] = RelayMessage(
          id: existing.id,
          sessionId: existing.sessionId,
          role: existing.role,
          content: existing.content + delta,
          status: .streaming,
          createdAt: existing.createdAt,
          updatedAt: createdAt
        )
      } else {
        session.messages.append(
          RelayMessage(
            id: messageId,
            sessionId: sessionId,
            role: .assistant,
            content: delta,
            status: .streaming,
            createdAt: createdAt,
            updatedAt: createdAt
          )
        )
      }
    case let .messageCompleted(_, messageId, createdAt):
      if let index = session.messages.firstIndex(where: { $0.id == messageId }) {
        let existing = session.messages[index]
        session.messages[index] = RelayMessage(
          id: existing.id,
          sessionId: existing.sessionId,
          role: existing.role,
          content: existing.content,
          status: .completed,
          createdAt: existing.createdAt,
          updatedAt: createdAt
        )
      }
    case let .runFailed(_, _, error, createdAt):
      errorMessage = error

      if let index = session.messages.lastIndex(where: { $0.role == .assistant && $0.status == .streaming }) {
        let existing = session.messages[index]
        session.messages[index] = RelayMessage(
          id: existing.id,
          sessionId: existing.sessionId,
          role: existing.role,
          content: existing.content,
          status: .error,
          createdAt: existing.createdAt,
          updatedAt: createdAt
        )
      }
    default:
      break
    }

    activeSession = session
  }
}

extension RelayAppModel {
  public static var preview: RelayAppModel {
    let client = StubRelayAPIClient(
      authState: RelayAuthSessionState(
        authenticated: true,
        configured: true,
        actor: RelayAuthSessionActor(method: .github, provider: .github, userId: "preview-user")
      ),
      routeStatus: .ready(kind: .defaultDevice),
      sessionList: RelaySessionListSnapshot(
        items: [
          RelaySessionSummary(
            id: "session-1",
            title: "Refine iPhone shell",
            workspaceId: "web-cli",
            workspaceName: "web-cli",
            updatedAt: Date()
          ),
        ],
        preferredSessionId: "session-1"
      ),
      sessionsById: [
        "session-1": RelaySessionThread(
          id: "session-1",
          workspaceId: "web-cli",
          title: "Refine iPhone shell",
          turnCount: 1,
          messages: [
            RelayMessage(
              id: "message-1",
              sessionId: "session-1",
              role: .assistant,
              content: "This is the minimal iPhone session shell for v0.1.",
              status: .completed,
              createdAt: Date(),
              updatedAt: Date()
            ),
          ],
          createdAt: Date(),
          updatedAt: Date()
        ),
      ]
    )
    let authController = RelayAuthController(apiClient: client, tokenStore: InMemoryRelaySupabaseTokenStore())
    return RelayAppModel(authController: authController, apiClient: client)
  }
}
