import { TopNav } from "@/components/top-nav";

const groups = [
  {
    title: "today",
    items: ["running now", "waiting review", "recently finished"],
  },
  {
    title: "filters",
    items: ["workspace:web-cli", "status:running", "files changed", "has memory"],
  },
];

const sessions = [
  {
    title: "Refine Relay workspace shell",
    status: "running",
    summary: "tightened typography, reduced sidebar width, aligned left rail with terminal-style index.",
    time: "10m ago",
    workspace: "relay / web-cli",
    files: 3,
    turns: 14,
    memory: "candidate",
  },
  {
    title: "Define V1 TDD execution plan",
    status: "done",
    summary: "wrote staged plan for web app, bridge service, tests, and visual constraints.",
    time: "1h ago",
    workspace: "relay / web-cli",
    files: 2,
    turns: 9,
    memory: "saved",
  },
  {
    title: "Name exploration for product brand",
    status: "done",
    summary: "compared Roam vs Relay and locked the product narrative around continuity and handoff.",
    time: "2h ago",
    workspace: "relay / web-cli",
    files: 1,
    turns: 11,
    memory: "saved",
  },
  {
    title: "Initial product discovery",
    status: "done",
    summary: "clarified local-first agent workspace, three-pane layout, and app-server integration direction.",
    time: "4h ago",
    workspace: "relay / web-cli",
    files: 1,
    turns: 18,
    memory: "pending",
  },
];

const selectedSession = {
  title: "Refine Relay workspace shell",
  startedAt: "2026-04-02 09:05",
  lastActivity: "2026-04-02 10:00",
  branch: "main",
  workspace: "/Users/ruska/project/web-cli",
  summary:
    "This session converged the visual style toward a colder, quieter terminal-document aesthetic and established that the next step is API and data model design.",
  outputs: [
    "Adjusted top navigation height and typography",
    "Converted left rail into grouped index with active marker",
    "Reduced left panel width by roughly one third",
  ],
};

const memoryChat = [
  {
    role: "system",
    title: "system template",
    body: "Generate durable memory from the selected session. Prefer project rules, style constraints, and repeatable workflow habits over temporary implementation details.",
  },
  {
    role: "assistant",
    title: "draft candidates",
    body: "I found three likely memories: keep Relay visually quiet and typography-led; keep files contextual inside workspace; use sessions as the source material for memory generation rather than storing memory ad hoc.",
  },
  {
    role: "user",
    title: "user prompt",
    body: "Keep only the product-level and UI-level memory. Ignore one-off implementation details from this session.",
  },
  {
    role: "assistant",
    title: "refined draft",
    body: "Understood. I would keep two durable memories from this session and leave the rest as transient notes.",
  },
];

const memoryCandidates = [
  "Relay UI should stay low-decoration, typography-led, and visually restrained.",
  "Top-level navigation should be workspace / sessions / memories / readme.",
];

export default function SessionsPage() {
  return (
    <main className="relay-app">
      <TopNav active="sessions" />

      <section className="sessions-shell">
        <aside className="panel panel-left sessions-filter-panel">
          <div className="panel-head">
            <span className="eyebrow">library</span>
          </div>

          {groups.map((group) => (
            <section className="section-group" key={group.title}>
              <h2 className="section-title">#{group.title}</h2>
              <div className="session-list">
                {group.items.map((item, index) => (
                  <article
                    className={`session-item ${group.title === "today" && index === 0 ? "session-item-active" : ""}`}
                    key={item}
                  >
                    <div className="session-row">
                      <h3>{item}</h3>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </aside>

        <section className="panel panel-center sessions-list-panel">
          <div className="sessions-header">
            <span className="eyebrow">sessions</span>
            <p className="sessions-header-copy">
              history, searchable context, and raw material for durable memory
            </p>
          </div>

          <div className="session-record-list">
            {sessions.map((session, index) => (
              <article
                className={`session-record ${index === 0 ? "session-record-active" : ""}`}
                key={session.title}
              >
                <div className="session-record-top">
                  <h2>{session.title}</h2>
                  <span className={`record-status record-status-${session.status}`}>
                    {session.status}
                  </span>
                </div>
                <p>{session.summary}</p>
                <div className="session-record-meta">
                  <span>{session.workspace}</span>
                  <span>{session.time}</span>
                  <span>{session.files} files</span>
                  <span>{session.turns} turns</span>
                  <span>memory:{session.memory}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="panel panel-right sessions-detail-panel">
          <div className="panel-head">
            <span className="eyebrow">memory copilot</span>
            <div className="tab-row">
              <button className="tab-button tab-button-active" type="button">
                generate
              </button>
              <button className="tab-button" type="button">
                template
              </button>
            </div>
          </div>

          <section className="detail-block">
            <h2>{selectedSession.title}</h2>
            <p>{selectedSession.summary}</p>
          </section>

          <section className="detail-block">
            <h3>selected context</h3>
            <div className="detail-list">
              <span>started: {selectedSession.startedAt}</span>
              <span>last activity: {selectedSession.lastActivity}</span>
              <span>branch: {selectedSession.branch}</span>
              <span>workspace: {selectedSession.workspace}</span>
            </div>
          </section>

          <section className="detail-block memory-chat-block">
            <h3>conversation</h3>
            <div className="memory-chat-list">
              {memoryChat.map((item) => (
                <article className={`memory-chat-item memory-chat-item-${item.role}`} key={item.body}>
                  <div className="memory-chat-role">{item.title}</div>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="detail-block">
            <h3>candidate memories</h3>
            <div className="memory-candidate-list">
              {memoryCandidates.map((item) => (
                <label className="memory-candidate" key={item}>
                  <input defaultChecked type="checkbox" />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </section>

          <div className="memory-composer">
            <div className="memory-composer-input">
              refine these into durable product memory and remove temporary implementation details...
            </div>
            <div className="memory-composer-actions">
              <button type="button">save memory</button>
              <button type="button">regenerate</button>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
