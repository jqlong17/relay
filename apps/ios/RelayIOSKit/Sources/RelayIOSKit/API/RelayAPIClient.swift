import Foundation

public struct RelaySessionListSnapshot: Equatable, Sendable {
  public let items: [RelaySessionSummary]
  public let preferredSessionId: String?

  public init(items: [RelaySessionSummary], preferredSessionId: String?) {
    self.items = items
    self.preferredSessionId = preferredSessionId
  }
}

public protocol RelayAPIClient: Sendable {
  func loadAuthSession() async throws -> RelayAuthSessionState
  func registerSupabaseSession(_ tokens: RelaySupabaseSessionTokens) async throws -> RelayAuthSessionState
  func logout() async throws
  func loadRouteStatus() async throws -> RelayRouteStatus
  func loadSessionList(fresh: Bool) async throws -> RelaySessionListSnapshot
  func loadSession(id: String, fresh: Bool) async throws -> RelaySessionThread
  func sendMessage(sessionId: String, content: String) async throws -> [RelayRuntimeEvent]
  func sendMessageStream(sessionId: String, content: String) async throws -> AsyncThrowingStream<RelayRuntimeEvent, Error>
  func subscribeRuntimeEvents(sessionId: String?, workspaceId: String?) async throws -> AsyncThrowingStream<RelayRuntimeEvent, Error>
}

public enum RelayAPIClientError: Error, Equatable, Sendable {
  case invalidResponse
  case unauthorized
  case unavailable(String)
  case requestFailed(String)

  public var errorDescription: String {
    switch self {
    case .invalidResponse:
      return "Relay returned an invalid response."
    case .unauthorized:
      return "Your Relay session expired. Please sign in again."
    case let .unavailable(message), let .requestFailed(message):
      return message
    }
  }
}

public actor LiveRelayAPIClient: RelayAPIClient {
  private let configuration: RelayAPIConfiguration
  private let session: URLSession

  public init(configuration: RelayAPIConfiguration, session: URLSession? = nil) {
    self.configuration = configuration

    if let session {
      self.session = session
      return
    }

    let sessionConfiguration = URLSessionConfiguration.default
    sessionConfiguration.httpCookieAcceptPolicy = .always
    sessionConfiguration.httpCookieStorage = HTTPCookieStorage.shared
    sessionConfiguration.httpShouldSetCookies = true
    self.session = URLSession(configuration: sessionConfiguration)
  }

  public func loadAuthSession() async throws -> RelayAuthSessionState {
    let request = makeRequest(path: "/api/auth/session", method: "GET")
    let payload: AuthSessionResponse = try await decode(request, as: AuthSessionResponse.self)
    return payload.domainValue
  }

  public func registerSupabaseSession(_ tokens: RelaySupabaseSessionTokens) async throws -> RelayAuthSessionState {
    let request = try makeJSONRequest(
      path: "/api/auth/supabase-session",
      method: "POST",
      body: tokens
    )
    _ = try await perform(request)
    return try await loadAuthSession()
  }

  public func logout() async throws {
    let request = makeRequest(path: "/api/auth/logout", method: "POST")
    _ = try await perform(request)
  }

  public func loadRouteStatus() async throws -> RelayRouteStatus {
    let request = makeRequest(path: "/api/bridge/route-status", method: "GET")
    let payload: BridgeRouteStatusResponse = try await decode(request, as: BridgeRouteStatusResponse.self)
    return payload.domainValue
  }

  public func loadSessionList(fresh: Bool) async throws -> RelaySessionListSnapshot {
    let query = fresh ? "?fresh=1" : ""
    let request = makeRequest(path: "/api/bridge/sessions\(query)", method: "GET")
    let payload: SessionListResponse = try await decode(request, as: SessionListResponse.self)
    return RelaySessionListSnapshot(
      items: payload.items.map(\.summaryValue),
      preferredSessionId: payload.preferredSessionId
    )
  }

  public func loadSession(id: String, fresh: Bool) async throws -> RelaySessionThread {
    let query = fresh ? "?fresh=1" : ""
    let request = makeRequest(path: "/api/bridge/sessions/\(id)\(query)", method: "GET")
    let payload: SessionDetailResponse = try await decode(request, as: SessionDetailResponse.self)
    return payload.item.threadValue
  }

  public func sendMessage(sessionId: String, content: String) async throws -> [RelayRuntimeEvent] {
    let request = try makeJSONRequest(
      path: "/api/bridge/runtime/run",
      method: "POST",
      body: RunRequest(sessionId: sessionId, content: content, attachments: [])
    )
    let payload: RunResponse = try await decode(request, as: RunResponse.self)
    return payload.events
  }

  public func sendMessageStream(sessionId: String, content: String) async throws -> AsyncThrowingStream<RelayRuntimeEvent, Error> {
    let request = try makeJSONRequest(
      path: "/api/bridge/runtime/run?stream=1",
      method: "POST",
      body: RunRequest(sessionId: sessionId, content: content, attachments: [])
    )
    let session = self.session

    return AsyncThrowingStream { continuation in
      let task = Task {
        do {
          let (bytes, response) = try await session.bytes(for: request)
          let httpResponse = try Self.httpResponse(from: response)

          guard (200...299).contains(httpResponse.statusCode) else {
            throw try await Self.error(from: httpResponse, lines: bytes.lines)
          }

          let decoder = Self.makeDecoder()

          for try await line in bytes.lines {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)

            if trimmed.isEmpty {
              continue
            }

            let data = Data(trimmed.utf8)
            continuation.yield(try decoder.decode(RelayRuntimeEvent.self, from: data))
          }

          continuation.finish()
        } catch {
          continuation.finish(throwing: error)
        }
      }

      continuation.onTermination = { _ in
        task.cancel()
      }
    }
  }

  public func subscribeRuntimeEvents(sessionId: String?, workspaceId: String?) async throws -> AsyncThrowingStream<RelayRuntimeEvent, Error> {
    var components = URLComponents(url: configuration.endpoint("/api/bridge/runtime/events"), resolvingAgainstBaseURL: false)
    var queryItems: [URLQueryItem] = []

    if let sessionId, !sessionId.isEmpty {
      queryItems.append(URLQueryItem(name: "sessionId", value: sessionId))
    }

    if let workspaceId, !workspaceId.isEmpty {
      queryItems.append(URLQueryItem(name: "workspaceId", value: workspaceId))
    }

    if !queryItems.isEmpty {
      components?.queryItems = queryItems
    }

    guard let url = components?.url else {
      throw RelayAPIClientError.invalidResponse
    }

    let request = Self.makeEventStreamRequest(url: url)

    let session = self.session

    return AsyncThrowingStream { continuation in
      let task = Task {
        do {
          let (bytes, response) = try await session.bytes(for: request)
          let httpResponse = try Self.httpResponse(from: response)

          guard (200...299).contains(httpResponse.statusCode) else {
            throw try await Self.error(from: httpResponse, lines: bytes.lines)
          }

          let decoder = Self.makeDecoder()

          for try await line in bytes.lines {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)

            if trimmed.isEmpty || trimmed.hasPrefix(":") || trimmed.hasPrefix("event:") {
              continue
            }

            guard trimmed.hasPrefix("data:") else {
              continue
            }

            let payload = trimmed.dropFirst("data:".count).trimmingCharacters(in: .whitespaces)
            guard !payload.isEmpty else {
              continue
            }

            continuation.yield(try decoder.decode(RelayRuntimeEvent.self, from: Data(payload.utf8)))
          }

          continuation.finish()
        } catch {
          continuation.finish(throwing: error)
        }
      }

      continuation.onTermination = { _ in
        task.cancel()
      }
    }
  }

  private func perform(_ request: URLRequest) async throws -> Data {
    let (data, response) = try await session.data(for: request)
    let httpResponse = try Self.httpResponse(from: response)

    guard (200...299).contains(httpResponse.statusCode) else {
      throw Self.error(from: httpResponse, data: data)
    }

    return data
  }

  private func decode<T: Decodable>(_ request: URLRequest, as type: T.Type) async throws -> T {
    let data = try await perform(request)
    return try Self.makeDecoder().decode(type, from: data)
  }

  private func makeRequest(path: String, method: String) -> URLRequest {
    var request = URLRequest(url: configuration.endpoint(path))
    request.httpMethod = method
    request.cachePolicy = .reloadIgnoringLocalCacheData
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    return request
  }

  private func makeJSONRequest<T: Encodable>(path: String, method: String, body: T) throws -> URLRequest {
    var request = makeRequest(path: path, method: method)
    request.httpBody = try JSONEncoder().encode(body)
    return request
  }

  private static func makeDecoder() -> JSONDecoder {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .custom { decoder in
      let container = try decoder.singleValueContainer()
      let value = try container.decode(String.self)
      let fractional = ISO8601DateFormatter()
      fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
      let plain = ISO8601DateFormatter()

      if let date = fractional.date(from: value) ?? plain.date(from: value) {
        return date
      }

      throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid ISO-8601 date: \(value)")
    }
    return decoder
  }

  private static func httpResponse(from response: URLResponse) throws -> HTTPURLResponse {
    guard let httpResponse = response as? HTTPURLResponse else {
      throw RelayAPIClientError.invalidResponse
    }

    return httpResponse
  }

  private static func error(from response: HTTPURLResponse, data: Data) -> RelayAPIClientError {
    let message = errorMessage(from: data)

    if response.statusCode == 401 {
      return .unauthorized
    }

    if response.statusCode == 409 {
      return .unavailable(message)
    }

    return .requestFailed(message)
  }

  private static func error<S: AsyncSequence>(
    from response: HTTPURLResponse,
    lines: S
  ) async throws -> RelayAPIClientError where S.Element == String {
    var fragments: [String] = []

    for try await line in lines {
      fragments.append(line)
    }

    return error(from: response, data: Data(fragments.joined(separator: "\n").utf8))
  }

  private static func errorMessage(from data: Data) -> String {
    let raw = String(decoding: data, as: UTF8.self)

    if let payload = try? JSONDecoder().decode(ErrorResponse.self, from: data),
       let error = payload.error?.trimmingCharacters(in: .whitespacesAndNewlines),
       !error.isEmpty {
      return error
    }

    return raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Request failed." : raw
  }

  private static func makeEventStreamRequest(url: URL) -> URLRequest {
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
    return request
  }
}

public struct StubRelayAPIClient: RelayAPIClient {
  public var authState: RelayAuthSessionState
  public var routeStatus: RelayRouteStatus
  public var sessionList: RelaySessionListSnapshot
  public var sessionsById: [String: RelaySessionThread]
  public var runtimeEvents: [RelayRuntimeEvent]

  public init(
    authState: RelayAuthSessionState = .signedOut,
    routeStatus: RelayRouteStatus = .unavailable(kind: .sessionExpired),
    sessionList: RelaySessionListSnapshot = RelaySessionListSnapshot(items: [], preferredSessionId: nil),
    sessionsById: [String: RelaySessionThread] = [:],
    runtimeEvents: [RelayRuntimeEvent] = []
  ) {
    self.authState = authState
    self.routeStatus = routeStatus
    self.sessionList = sessionList
    self.sessionsById = sessionsById
    self.runtimeEvents = runtimeEvents
  }

  public func loadAuthSession() async throws -> RelayAuthSessionState {
    authState
  }

  public func registerSupabaseSession(_ tokens: RelaySupabaseSessionTokens) async throws -> RelayAuthSessionState {
    guard !tokens.accessToken.isEmpty, !tokens.refreshToken.isEmpty else {
      throw RelayAPIClientError.unauthorized
    }

    return authState
  }

  public func logout() async throws {}

  public func loadRouteStatus() async throws -> RelayRouteStatus {
    routeStatus
  }

  public func loadSessionList(fresh: Bool) async throws -> RelaySessionListSnapshot {
    sessionList
  }

  public func loadSession(id: String, fresh: Bool) async throws -> RelaySessionThread {
    guard let session = sessionsById[id] else {
      throw RelayAPIClientError.requestFailed("Session not found.")
    }

    return session
  }

  public func sendMessage(sessionId: String, content: String) async throws -> [RelayRuntimeEvent] {
    runtimeEvents
  }

  public func sendMessageStream(sessionId: String, content: String) async throws -> AsyncThrowingStream<RelayRuntimeEvent, Error> {
    let events = runtimeEvents

    return AsyncThrowingStream { continuation in
      for event in events {
        continuation.yield(event)
      }

      continuation.finish()
    }
  }

  public func subscribeRuntimeEvents(sessionId: String?, workspaceId: String?) async throws -> AsyncThrowingStream<RelayRuntimeEvent, Error> {
    try await sendMessageStream(sessionId: sessionId ?? "", content: workspaceId ?? "")
  }
}

private struct ErrorResponse: Decodable {
  let error: String?
}

private struct AuthSessionResponse: Decodable {
  let authenticated: Bool
  let configured: Bool
  let session: RelayAuthSessionActor?

  var domainValue: RelayAuthSessionState {
    RelayAuthSessionState(authenticated: authenticated, configured: configured, actor: session)
  }
}

private struct BridgeRouteStatusResponse: Decodable {
  let kind: String
  let reason: String
  let defaultLocalDeviceId: String?

  var domainValue: RelayRouteStatus {
    switch (kind, reason) {
    case ("remote", "remote_default_device_online"):
      return .ready(kind: .defaultDevice)
    case ("local", "local_device_matches_default"), ("local", "local_bridge_available"):
      return .ready(kind: .currentComputer)
    case ("local", "default_device_offline_using_local"):
      return .limited(kind: .currentComputerTookOver)
    case ("local", "no_default_device_using_local"), ("local", "default_device_missing_using_local"):
      return .limited(kind: .needsDefaultDevice)
    case ("local", "github_not_signed_in"), ("unavailable", "github_session_expired"):
      return .unavailable(kind: .sessionExpired)
    case ("unavailable", "default_device_offline"):
      return .unavailable(kind: .defaultDeviceOffline)
    case ("unavailable", "no_default_device"), ("unavailable", "default_device_missing"):
      return .limited(kind: .needsDefaultDevice)
    default:
      return .unavailable(kind: .unknown)
    }
  }
}

private struct SessionListResponse: Decodable {
  let items: [SessionPayload]
  let preferredSessionId: String?
}

private struct SessionDetailResponse: Decodable {
  let item: SessionPayload
}

private struct RunRequest: Encodable {
  let sessionId: String
  let content: String
  let attachments: [AttachmentPayload]
}

private struct AttachmentPayload: Encodable {
  let path: String
}

private struct RunResponse: Decodable {
  let sessionId: String
  let events: [RelayRuntimeEvent]
}

private struct SessionPayload: Decodable {
  let id: String
  let workspaceId: String
  let title: String
  let turnCount: Int
  let messages: [MessagePayload]
  let createdAt: Date
  let updatedAt: Date
  let cwd: String?
  let syncState: RelaySessionThread.SyncState?
  let brokenReason: String?

  var summaryValue: RelaySessionSummary {
    RelaySessionSummary(
      id: id,
      title: title,
      workspaceId: workspaceId,
      workspaceName: nil,
      updatedAt: updatedAt
    )
  }

  var threadValue: RelaySessionThread {
    RelaySessionThread(
      id: id,
      workspaceId: workspaceId,
      title: title,
      turnCount: turnCount,
      messages: messages.map(\.domainValue),
      createdAt: createdAt,
      updatedAt: updatedAt,
      cwd: cwd,
      syncState: syncState,
      brokenReason: brokenReason
    )
  }
}

private struct MessagePayload: Decodable {
  let id: String
  let sessionId: String
  let role: RelayMessage.Role
  let content: String
  let status: RelayMessage.Status?
  let createdAt: Date
  let updatedAt: Date

  var domainValue: RelayMessage {
    RelayMessage(
      id: id,
      sessionId: sessionId,
      role: role,
      content: content,
      status: status,
      createdAt: createdAt,
      updatedAt: updatedAt
    )
  }
}
