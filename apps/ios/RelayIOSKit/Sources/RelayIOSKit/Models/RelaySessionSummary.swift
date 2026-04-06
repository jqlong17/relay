import Foundation

public struct RelaySessionSummary: Equatable, Identifiable, Codable, Sendable {
  public let id: String
  public let title: String
  public let workspaceId: String
  public let workspaceName: String?
  public let updatedAt: Date

  public init(id: String, title: String, workspaceId: String, workspaceName: String? = nil, updatedAt: Date) {
    self.id = id
    self.title = title
    self.workspaceId = workspaceId
    self.workspaceName = workspaceName
    self.updatedAt = updatedAt
  }
}
