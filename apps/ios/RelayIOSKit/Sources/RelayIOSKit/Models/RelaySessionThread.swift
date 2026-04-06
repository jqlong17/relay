import Foundation

public struct RelaySessionThread: Equatable, Identifiable, Codable, Sendable {
  public enum SyncState: String, Codable, Equatable, Sendable {
    case idle
    case running
    case syncing
    case stale
    case broken
  }

  public let id: String
  public let workspaceId: String
  public let title: String
  public let turnCount: Int
  public var messages: [RelayMessage]
  public let createdAt: Date
  public let updatedAt: Date
  public let cwd: String?
  public let syncState: SyncState?
  public let brokenReason: String?

  public init(
    id: String,
    workspaceId: String,
    title: String,
    turnCount: Int,
    messages: [RelayMessage],
    createdAt: Date,
    updatedAt: Date,
    cwd: String? = nil,
    syncState: SyncState? = nil,
    brokenReason: String? = nil
  ) {
    self.id = id
    self.workspaceId = workspaceId
    self.title = title
    self.turnCount = turnCount
    self.messages = messages
    self.createdAt = createdAt
    self.updatedAt = updatedAt
    self.cwd = cwd
    self.syncState = syncState
    self.brokenReason = brokenReason
  }
}
