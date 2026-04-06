import SwiftUI
import RelayIOSKit

struct RelayHomeView: View {
  @Bindable var model: RelayAppModel

  var body: some View {
    NavigationStack {
      List {
        Section("Connection") {
          RelayStatusCard(card: model.connectionCard)
        }

        Section("Recent Sessions") {
          ForEach(model.recentSessions) { session in
            NavigationLink {
              SessionThreadView(model: model, session: session)
            } label: {
              VStack(alignment: .leading, spacing: 4) {
                Text(session.title)
                  .font(.headline)
                Text(session.workspaceName ?? session.workspaceId)
                  .font(.caption)
                  .foregroundStyle(.secondary)
              }
            }
          }
        }
      }
      .navigationTitle("Relay")
      .toolbar {
        ToolbarItem(placement: .topBarLeading) {
          Button(model.isRefreshing ? "Refreshing..." : "Refresh") {
            Task {
              await model.refresh()
            }
          }
          .disabled(model.isRefreshing || model.isSending)
        }

        ToolbarItem(placement: .topBarTrailing) {
          Button("Sign Out") {
            Task {
              await model.signOut()
            }
          }
        }
      }
    }
  }
}

private struct RelayStatusCard: View {
  let card: RelayConnectionCard

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(card.title)
        .font(.headline)
      Text(card.detail)
        .font(.subheadline)
        .foregroundStyle(.secondary)
    }
    .padding(.vertical, 8)
  }
}
