import SwiftUI
import RelayIOSKit
import AuthenticationServices

struct AuthGateView: View {
  @Bindable var model: RelayAppModel
  @State private var signInController: RelayGitHubSignInController
  @State private var isSigningIn = false

  init(model: RelayAppModel, authBaseURL: URL) {
    self.model = model
    _signInController = State(initialValue: RelayGitHubSignInController(baseURL: authBaseURL))
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        Text("Relay")
          .font(.largeTitle.weight(.semibold))

        Text("Sign in to continue your current Codex session from iPhone.")
          .font(.body)
          .foregroundStyle(.secondary)

        if let errorMessage = model.errorMessage {
          Text(errorMessage)
            .font(.footnote)
            .foregroundStyle(.red)
        }

        Group {
          Text("Use GitHub to connect this iPhone to your Relay account.")
            .font(.headline)
          Text("Relay will finish GitHub sign-in in a secure browser sheet, then restore your Relay session and device routing automatically.")
            .font(.footnote)
            .foregroundStyle(.secondary)
        }

        Button(model.isBootstrapping || isSigningIn ? "Opening GitHub..." : "Continue with GitHub") {
          Task {
            await startGitHubSignIn()
          }
        }
        .buttonStyle(.borderedProminent)
        .disabled(model.isBootstrapping || isSigningIn)
      }
      .frame(maxWidth: .infinity, alignment: .topLeading)
      .padding(24)
    }
  }

  @MainActor
  private func startGitHubSignIn() async {
    isSigningIn = true
    defer { isSigningIn = false }

    do {
      let callbackURL = try await signInController.signIn()
      await model.completeGitHubSignIn(callbackURL: callbackURL)
    } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
      return
    } catch {
      model.presentError(error)
    }
  }
}
