import { getMessages } from "@/config/messages";
import { loadUiConfig } from "@/config/ui.config";
import { TopNav } from "@/components/top-nav";

export default function SessionsPage() {
  const uiConfig = loadUiConfig();
  const messages = getMessages(uiConfig.language);
  const sessionGroups = messages.sessions.groups;
  const selectedSession = messages.sessions.selectedSession;
  const memoryChat = messages.sessions.memoryChat;

  return (
    <main className="relay-app">
      <TopNav active="sessions" language={uiConfig.language} />

      <section className="sessions-shell">
        <aside className="panel panel-left sessions-rail">
          {sessionGroups.map((group) => (
            <section className="section-group" key={group.workspace}>
              <div className="workspace-group-head">
                <h2 className="section-title">{group.workspace}</h2>
                <span className="workspace-branch">{group.branch}</span>
              </div>
              <div className="session-list">
                {group.items.map((session) => (
                  <article
                    className={`session-item ${session.active ? "session-item-active" : ""}`}
                    key={`${group.workspace}-${session.title}`}
                  >
                    <div className="session-row">
                      <h3>{session.title}</h3>
                      <span className="session-rail-time">{session.time}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </aside>

        <section className="panel panel-center sessions-thread-panel">
          <div className="sessions-header">
            <div className="sessions-header-top">
              <span className="eyebrow">{messages.sessions.headerEyebrow}</span>
              <span className="sessions-header-meta">{selectedSession.workspace}</span>
            </div>
            <h1 className="sessions-header-title">{selectedSession.title}</h1>
          </div>

          <div className="session-thread">
            {selectedSession.turns.map((turn, index) => (
              <article className={`thread-item thread-item-${turn.role}`} key={`${turn.role}-${index}`}>
                <div className="thread-role">{turn.label}</div>
                <p>{turn.body}</p>
              </article>
            ))}
          </div>
        </section>

        <aside className="panel panel-right sessions-memory-panel">
          <div className="panel-head">
            <div className="sessions-memory-head">
              <span className="eyebrow">{messages.sessions.memoryCopilot}</span>
            </div>
          </div>

          <section className="memory-panel">
            <div className="memory-chat-list">
              {memoryChat.map((item, index) => (
                <article
                  className={`memory-chat-item memory-chat-item-${item.role}`}
                  key={`${item.title}-${index}`}
                >
                  <div className="memory-chat-role">{item.title}</div>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>

            <div className="memory-composer">
              <div className="memory-composer-input">{messages.sessions.composer}</div>
              <div className="memory-composer-actions">
                <button type="button">{messages.sessions.saveMemory}</button>
                <button type="button">{messages.sessions.regenerate}</button>
              </div>
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
