import Foundation
import RelayIOSKit

enum AppEnvironment {
  private static let defaultRelayBaseURL = URL(string: "https://relay-web-9g6d.onrender.com")!

  static func relayBaseURL() -> URL {
    ProcessInfo.processInfo.environment["RELAY_IOS_BASE_URL"].flatMap(URL.init(string:))
      ?? defaultRelayBaseURL
  }

  @MainActor
  static func makeAppModel() -> RelayAppModel {
    if ProcessInfo.processInfo.environment["XCODE_RUNNING_FOR_PREVIEWS"] == "1" {
      return .preview
    }

    let baseURL = relayBaseURL()
    let apiClient = LiveRelayAPIClient(configuration: RelayAPIConfiguration(baseURL: baseURL))
    let authController = RelayAuthController(
      apiClient: apiClient,
      tokenStore: KeychainRelaySupabaseTokenStore(service: "com.relay.ios", account: "relay-supabase-session")
    )

    return RelayAppModel(authController: authController, apiClient: apiClient)
  }
}
