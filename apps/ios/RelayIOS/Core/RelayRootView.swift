import SwiftUI
import RelayIOSKit

struct RelayRootView: View {
  @Bindable var model: RelayAppModel
  let authBaseURL: URL

  var body: some View {
    Group {
      if model.authState.authenticated {
        RelayHomeView(model: model)
      } else {
        AuthGateView(model: model, authBaseURL: authBaseURL)
      }
    }
  }
}
