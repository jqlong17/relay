import Foundation

public struct RelayMessage: Equatable, Identifiable, Codable, Sendable {
  public let id: String
  public let sessionId: String
  public let role: Role
  public let content: String
  public let status: Status?
  public let createdAt: Date
  public let updatedAt: Date

  public enum Role: String, Codable, Equatable, Sendable {
    case user
    case assistant
    case system
    case tool
  }

  public enum Status: String, Codable, Equatable, Sendable {
    case streaming
    case completed
    case error
  }

  public init(
    id: String,
    sessionId: String,
    role: Role,
    content: String,
    status: Status? = nil,
    createdAt: Date,
    updatedAt: Date
  ) {
    self.id = id
    self.sessionId = sessionId
    self.role = role
    self.content = content
    self.status = status
    self.createdAt = createdAt
    self.updatedAt = updatedAt
  }
}
