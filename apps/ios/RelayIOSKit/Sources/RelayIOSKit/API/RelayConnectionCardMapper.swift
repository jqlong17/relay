import Foundation

public enum RelayConnectionCardMapper {
  public static func makeCard(for status: RelayRouteStatus) -> RelayConnectionCard {
    switch status {
    case .ready(kind: .defaultDevice):
      return RelayConnectionCard(
        title: "Connected to your default computer",
        detail: "You can continue the active Relay session right away.",
        tone: .success,
        isActionable: true
      )
    case .ready(kind: .currentComputer):
      return RelayConnectionCard(
        title: "Connected through this current machine",
        detail: "Relay can already continue through the machine that is currently available.",
        tone: .success,
        isActionable: true
      )
    case .limited(kind: .currentComputerTookOver):
      return RelayConnectionCard(
        title: "Switched to this computer",
        detail: "Your default computer is unavailable, but the current machine has already taken over.",
        tone: .warning,
        isActionable: true
      )
    case .limited(kind: .needsDefaultDevice):
      return RelayConnectionCard(
        title: "No default computer is set yet",
        detail: "Finish the first device bootstrap on your computer, then set that running Relay machine as the default device.",
        tone: .warning,
        isActionable: false
      )
    case .unavailable(kind: .defaultDeviceOffline):
      return RelayConnectionCard(
        title: "Your default computer is offline",
        detail: "Bring that computer and Relay back online before continuing.",
        tone: .warning,
        isActionable: false
      )
    case .unavailable(kind: .sessionExpired):
      return RelayConnectionCard(
        title: "Your session expired",
        detail: "Sign in again to restore Relay access.",
        tone: .warning,
        isActionable: false
      )
    case .unavailable(kind: .unknown):
      return RelayConnectionCard(
        title: "Relay is unavailable right now",
        detail: "Check the device state and try again.",
        tone: .neutral,
        isActionable: false
      )
    }
  }
}
