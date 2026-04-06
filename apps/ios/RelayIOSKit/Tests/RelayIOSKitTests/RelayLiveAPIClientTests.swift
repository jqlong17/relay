import Foundation
import Testing

@testable import RelayIOSKit

struct RelayLiveAPIClientTests {
  @Test
  func decodesRouteStatusSessionListAndSessionDetailPayloads() async throws {
    let session = makeSession(
      routes: [
        "/api/bridge/route-status": .json([
          "kind": "remote",
          "reason": "remote_default_device_online",
          "defaultLocalDeviceId": "device-1",
        ].jsonData),
        "/api/bridge/sessions": .json([
          "items": [
            [
              "id": "session-1",
              "workspaceId": "workspace-1",
              "title": "Alpha",
              "turnCount": 1,
              "messages": [],
              "createdAt": "2026-04-06T09:00:00.000Z",
              "updatedAt": "2026-04-06T09:05:00.000Z",
            ],
          ],
          "preferredSessionId": "session-1",
        ].jsonData),
        "/api/bridge/sessions/session-1": .json([
          "item": [
            "id": "session-1",
            "workspaceId": "workspace-1",
            "title": "Alpha",
            "turnCount": 1,
            "messages": [
              [
                "id": "message-1",
                "sessionId": "session-1",
                "role": "assistant",
                "content": "Hello",
                "status": "completed",
                "createdAt": "2026-04-06T09:00:00.000Z",
                "updatedAt": "2026-04-06T09:00:01.000Z",
              ],
            ],
            "createdAt": "2026-04-06T09:00:00.000Z",
            "updatedAt": "2026-04-06T09:05:00.000Z",
          ],
        ].jsonData),
      ]
    )
    let client = LiveRelayAPIClient(
      configuration: RelayAPIConfiguration(baseURL: URL(string: "https://relay.example.com")!),
      session: session
    )

    let status = try await client.loadRouteStatus()
    let list = try await client.loadSessionList(fresh: false)
    let detail = try await client.loadSession(id: "session-1", fresh: false)

    #expect(status == .ready(kind: .defaultDevice))
    #expect(list.preferredSessionId == "session-1")
    #expect(list.items.first?.title == "Alpha")
    #expect(detail.messages.first?.content == "Hello")
  }
}

private enum MockHTTPResponse: Sendable {
  case json(Data)
}

private func makeSession(routes: [String: MockHTTPResponse]) -> URLSession {
  MockRelayURLProtocol.routes = routes
  let configuration = URLSessionConfiguration.ephemeral
  configuration.protocolClasses = [MockRelayURLProtocol.self]
  return URLSession(configuration: configuration)
}

private final class MockRelayURLProtocol: URLProtocol {
  nonisolated(unsafe) static var routes: [String: MockHTTPResponse] = [:]

  override class func canInit(with request: URLRequest) -> Bool {
    true
  }

  override class func canonicalRequest(for request: URLRequest) -> URLRequest {
    request
  }

  override func startLoading() {
    guard let url = request.url else {
      client?.urlProtocol(self, didFailWithError: URLError(.badURL))
      return
    }

    let key = url.path + (url.query.map { "?\($0)" } ?? "")
    guard let route = Self.routes[key] else {
      client?.urlProtocol(self, didFailWithError: URLError(.fileDoesNotExist))
      return
    }

    switch route {
    case let .json(data):
      let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: [
        "content-type": "application/json",
      ])!
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    }
  }

  override func stopLoading() {}
}

private extension Dictionary<String, Any> {
  var jsonData: Data {
    try! JSONSerialization.data(withJSONObject: self, options: [])
  }
}
