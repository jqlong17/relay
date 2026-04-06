import Foundation

public enum RelayRouteStatus: Equatable, Sendable {
  case ready(kind: ReadyKind)
  case limited(kind: LimitedKind)
  case unavailable(kind: UnavailableKind)

  public enum ReadyKind: String, Equatable, Sendable {
    case defaultDevice
    case currentComputer
  }

  public enum LimitedKind: String, Equatable, Sendable {
    case currentComputerTookOver
    case needsDefaultDevice
  }

  public enum UnavailableKind: String, Equatable, Sendable {
    case defaultDeviceOffline
    case sessionExpired
    case unknown
  }

  public var canLoadSessions: Bool {
    switch self {
    case .ready:
      return true
    case .limited(kind: .currentComputerTookOver):
      return true
    case .limited(kind: .needsDefaultDevice):
      return false
    case .unavailable:
      return false
    }
  }

  public var requiresAuthentication: Bool {
    if case .unavailable(kind: .sessionExpired) = self {
      return true
    }

    return false
  }
}
