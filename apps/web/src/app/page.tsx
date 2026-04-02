import { getMessages } from "@/config/messages";
import { loadUiConfig } from "@/config/ui.config";
import { TopNav } from "@/components/top-nav";

export default function Home() {
  const uiConfig = loadUiConfig();
  const messages = getMessages(uiConfig.language);
  const workspaces = messages.workspace.workspaces;
  const workspaceFeed = messages.workspace.feed;
  const files = messages.workspace.filesTree;

  return (
    <main className="relay-app">
      <TopNav active="workspace" language={uiConfig.language} />

      <section className="shell">
        <aside className="panel panel-left">
          {workspaces.map((workspace) => (
            <section className="section-group" key={workspace.title}>
              <div className="workspace-group-head">
                <h2 className="section-title">{workspace.title}</h2>
                <span className="workspace-branch">{workspace.branch}</span>
              </div>
              <div className="session-list">
                {workspace.sessions.map((session) => (
                  <article
                    className={`session-item ${session.active ? "session-item-active" : ""}`}
                    key={`${workspace.title}-${session.title}`}
                  >
                    <div className="session-row">
                      <h3>{session.title}</h3>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </aside>

        <section className="panel panel-center workspace-center">
          <div className="workspace-header">
            <span className="eyebrow">{messages.workspace.eyebrow}</span>
            <span className="workspace-header-meta">{messages.workspace.headerMeta}</span>
          </div>

          <div className="workspace-log workspace-timeline">
            {workspaceFeed.map((item) => (
              <article
                className={`workspace-log-item workspace-log-item-${item.role}`}
                key={`${item.label}-${item.title}`}
              >
                <div className="workspace-log-top">
                  <span className="workspace-log-label">{item.label}</span>
                  <span className="workspace-log-detail">{item.detail}</span>
                </div>
                <p>{item.title}</p>
              </article>
            ))}
          </div>

          <div className="composer">
            <div className="composer-prompt">relay &gt;</div>
            <div className="composer-input">{messages.workspace.composer}</div>
            <button className="composer-send" type="button">
              {messages.common.run}
            </button>
          </div>
        </section>

        <aside className="panel panel-right">
          <div className="panel-head">
            <span className="eyebrow">{messages.workspace.filesTitle}</span>
          </div>

          <div className="file-tree">
            {files.map((file) => (
              <button
                className={`file-row ${file.active ? "file-row-active" : ""} ${
                  file.kind === "folder" ? "file-row-folder" : "file-row-file"
                }`}
                key={`${file.depth}-${file.label}`}
                type="button"
              >
                <span
                  className="file-row-label"
                  style={{ paddingLeft: `${12 + file.depth * 18}px` }}
                >
                  {file.label}
                </span>
              </button>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
