import SwiftUI

@main
struct RelayIOSApp: App {
  private let authBaseURL = AppEnvironment.relayBaseURL()
  @State private var model = AppEnvironment.makeAppModel()

  var body: some Scene {
    WindowGroup {
      RelayRootView(model: model, authBaseURL: authBaseURL)
        .task {
          await model.bootstrap()
        }
    }
  }
}
