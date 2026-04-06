import Testing

@testable import RelayIOSKit

struct RelayRouteStatusMappingTests {
  @Test
  func currentComputerFallbackRemainsUsable() {
    let status = RelayRouteStatus.limited(kind: .currentComputerTookOver)

    #expect(status.canLoadSessions)
  }

  @Test
  func missingDefaultDeviceBlocksSessionLoading() {
    let status = RelayRouteStatus.limited(kind: .needsDefaultDevice)

    #expect(status.canLoadSessions == false)
  }

  @Test
  func sessionExpiredRequiresAuthentication() {
    let status = RelayRouteStatus.unavailable(kind: .sessionExpired)

    #expect(status.requiresAuthentication)
  }
}
