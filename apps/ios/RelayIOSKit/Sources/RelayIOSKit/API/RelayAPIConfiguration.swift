import Foundation

public struct RelayAPIConfiguration: Equatable, Sendable {
  public let baseURL: URL
  public let appName: String

  public init(baseURL: URL, appName: String = "Relay iOS") {
    self.baseURL = baseURL
    self.appName = appName
  }

  public func endpoint(_ path: String) -> URL {
    URL(string: path, relativeTo: baseURL)?.absoluteURL ?? baseURL
  }
}
