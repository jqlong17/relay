import Foundation
import Testing

@testable import RelayIOSKit

struct RelayConnectionCardMapperTests {
  @Test
  func mapsDefaultDeviceReadyState() {
    let card = RelayConnectionCardMapper.makeCard(for: .ready(kind: .defaultDevice))

    #expect(card.title == "Connected to your default computer")
    #expect(card.tone == .success)
    #expect(card.isActionable)
  }

  @Test
  func mapsCurrentComputerFallbackState() {
    let card = RelayConnectionCardMapper.makeCard(for: .limited(kind: .currentComputerTookOver))

    #expect(card.title == "Switched to this computer")
    #expect(card.tone == .warning)
    #expect(card.isActionable)
  }

  @Test
  func mapsSessionExpiredState() {
    let card = RelayConnectionCardMapper.makeCard(for: .unavailable(kind: .sessionExpired))

    #expect(card.title == "Your session expired")
    #expect(card.detail == "Sign in again to restore Relay access.")
    #expect(card.isActionable == false)
  }
}
