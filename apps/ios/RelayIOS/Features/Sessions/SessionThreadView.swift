import SwiftUI
import RelayIOSKit

struct SessionThreadView: View {
  @Bindable var model: RelayAppModel
  let session: RelaySessionSummary

  var body: some View {
    VStack(spacing: 0) {
      ScrollView {
        VStack(alignment: .leading, spacing: 12) {
          if let activeSession = model.activeSession, activeSession.id == session.id {
            ForEach(activeSession.messages) { message in
              VStack(alignment: .leading, spacing: 6) {
                Text(message.role.rawValue.capitalized)
                  .font(.caption.weight(.semibold))
                  .foregroundStyle(.secondary)
                Text(message.content.isEmpty ? "…" : message.content)
                  .font(.body)
              }
              .frame(maxWidth: .infinity, alignment: .leading)
              .padding(.vertical, 8)
            }
          } else {
            Text("Loading session…")
              .font(.body)
              .foregroundStyle(.secondary)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
      }
      .task(id: session.id) {
        if model.activeSession?.id != session.id {
          await model.selectSession(id: session.id)
        }
      }

      Divider()

      HStack(alignment: .bottom, spacing: 12) {
        TextField("Send a message to your local Codex…", text: $model.draftMessage, axis: .vertical)
          .textFieldStyle(.roundedBorder)

        Button(model.isSending ? "Sending..." : "Send") {
          Task {
            await model.sendCurrentDraft()
          }
        }
        .buttonStyle(.borderedProminent)
        .disabled(model.draftMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.isSending)
      }
      .padding(16)
    }
    .navigationTitle(session.title)
    .navigationBarTitleDisplayMode(.inline)
  }
}
