import Foundation
import Testing

@testable import RelayIOSKit

struct RelayOAuthCallbackTests {
  @Test
  func parsesSupabaseTokensFromRelayCallbackURL() throws {
    let payload = try RelayOAuthCallbackPayload(
      url: #require(URL(string: "relayios://auth/callback?access_token=token-a&refresh_token=token-b"))
    )

    #expect(payload.accessToken == "token-a")
    #expect(payload.refreshToken == "token-b")
  }

  @Test
  func surfacesOAuthErrorsFromRelayCallbackURL() throws {
    #expect(throws: RelayOAuthCallbackError.oauthFailed(message: "GitHub sign-in was denied")) {
      try RelayOAuthCallbackPayload(
        url: #require(
          URL(string: "relayios://auth/callback?error=access_denied&error_description=GitHub%20sign-in%20was%20denied")
        )
      )
    }
  }
}
