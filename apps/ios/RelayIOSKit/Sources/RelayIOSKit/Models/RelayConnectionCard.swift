import Foundation

public struct RelayConnectionCard: Equatable, Sendable {
  public let title: String
  public let detail: String
  public let tone: Tone
  public let isActionable: Bool

  public enum Tone: String, Equatable, Sendable {
    case neutral
    case success
    case warning
  }

  public init(title: String, detail: String, tone: Tone, isActionable: Bool) {
    self.title = title
    self.detail = detail
    self.tone = tone
    self.isActionable = isActionable
  }
}
