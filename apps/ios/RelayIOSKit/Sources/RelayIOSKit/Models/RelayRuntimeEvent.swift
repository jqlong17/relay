import Foundation

public enum RelayRuntimeEvent: Equatable, Sendable {
  case runStarted(runId: String, sessionId: String, createdAt: Date)
  case messageDelta(runId: String, messageId: String, delta: String, createdAt: Date)
  case processDelta(runId: String, itemId: String, phase: RelayProcessPhase, delta: String, createdAt: Date)
  case processStarted(runId: String, itemId: String, phase: RelayProcessPhase, label: String?, createdAt: Date)
  case processCompleted(runId: String, itemId: String, phase: RelayProcessPhase, createdAt: Date)
  case messageCompleted(runId: String, messageId: String, createdAt: Date)
  case runCompleted(runId: String, sessionId: String, createdAt: Date)
  case runFailed(runId: String, sessionId: String, error: String, createdAt: Date)
  case threadUpdated(sessionId: String, workspaceId: String?, createdAt: Date)
  case threadListChanged(sessionId: String?, workspaceId: String?, createdAt: Date)
  case threadBroken(sessionId: String, reason: String, createdAt: Date)
  case threadDeletedOrMissing(sessionId: String, workspaceId: String?, createdAt: Date)

  public var type: String {
    switch self {
    case .runStarted:
      return "run.started"
    case .messageDelta:
      return "message.delta"
    case .processDelta:
      return "process.delta"
    case .processStarted:
      return "process.started"
    case .processCompleted:
      return "process.completed"
    case .messageCompleted:
      return "message.completed"
    case .runCompleted:
      return "run.completed"
    case .runFailed:
      return "run.failed"
    case .threadUpdated:
      return "thread.updated"
    case .threadListChanged:
      return "thread.list.changed"
    case .threadBroken:
      return "thread.broken"
    case .threadDeletedOrMissing:
      return "thread.deleted_or_missing"
    }
  }
}

public enum RelayProcessPhase: String, Codable, Equatable, Sendable {
  case thinking
  case plan
  case command
}

extension RelayRuntimeEvent: Decodable {
  private enum CodingKeys: String, CodingKey {
    case type
    case runId
    case sessionId
    case messageId
    case delta
    case itemId
    case phase
    case label
    case error
    case workspaceId
    case reason
    case createdAt
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let type = try container.decode(String.self, forKey: .type)
    let createdAt = try container.decode(Date.self, forKey: .createdAt)

    switch type {
    case "run.started":
      self = .runStarted(
        runId: try container.decode(String.self, forKey: .runId),
        sessionId: try container.decode(String.self, forKey: .sessionId),
        createdAt: createdAt
      )
    case "message.delta":
      self = .messageDelta(
        runId: try container.decode(String.self, forKey: .runId),
        messageId: try container.decode(String.self, forKey: .messageId),
        delta: try container.decode(String.self, forKey: .delta),
        createdAt: createdAt
      )
    case "process.delta":
      self = .processDelta(
        runId: try container.decode(String.self, forKey: .runId),
        itemId: try container.decode(String.self, forKey: .itemId),
        phase: try container.decode(RelayProcessPhase.self, forKey: .phase),
        delta: try container.decode(String.self, forKey: .delta),
        createdAt: createdAt
      )
    case "process.started":
      self = .processStarted(
        runId: try container.decode(String.self, forKey: .runId),
        itemId: try container.decode(String.self, forKey: .itemId),
        phase: try container.decode(RelayProcessPhase.self, forKey: .phase),
        label: try container.decodeIfPresent(String.self, forKey: .label),
        createdAt: createdAt
      )
    case "process.completed":
      self = .processCompleted(
        runId: try container.decode(String.self, forKey: .runId),
        itemId: try container.decode(String.self, forKey: .itemId),
        phase: try container.decode(RelayProcessPhase.self, forKey: .phase),
        createdAt: createdAt
      )
    case "message.completed":
      self = .messageCompleted(
        runId: try container.decode(String.self, forKey: .runId),
        messageId: try container.decode(String.self, forKey: .messageId),
        createdAt: createdAt
      )
    case "run.completed":
      self = .runCompleted(
        runId: try container.decode(String.self, forKey: .runId),
        sessionId: try container.decode(String.self, forKey: .sessionId),
        createdAt: createdAt
      )
    case "run.failed":
      self = .runFailed(
        runId: try container.decode(String.self, forKey: .runId),
        sessionId: try container.decode(String.self, forKey: .sessionId),
        error: try container.decode(String.self, forKey: .error),
        createdAt: createdAt
      )
    case "thread.updated":
      self = .threadUpdated(
        sessionId: try container.decode(String.self, forKey: .sessionId),
        workspaceId: try container.decodeIfPresent(String.self, forKey: .workspaceId),
        createdAt: createdAt
      )
    case "thread.list.changed":
      self = .threadListChanged(
        sessionId: try container.decodeIfPresent(String.self, forKey: .sessionId),
        workspaceId: try container.decodeIfPresent(String.self, forKey: .workspaceId),
        createdAt: createdAt
      )
    case "thread.broken":
      self = .threadBroken(
        sessionId: try container.decode(String.self, forKey: .sessionId),
        reason: try container.decode(String.self, forKey: .reason),
        createdAt: createdAt
      )
    case "thread.deleted_or_missing":
      self = .threadDeletedOrMissing(
        sessionId: try container.decode(String.self, forKey: .sessionId),
        workspaceId: try container.decodeIfPresent(String.self, forKey: .workspaceId),
        createdAt: createdAt
      )
    default:
      throw DecodingError.dataCorruptedError(
        forKey: .type,
        in: container,
        debugDescription: "Unsupported runtime event type: \(type)"
      )
    }
  }
}
