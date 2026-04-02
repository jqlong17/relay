import { TopNav } from "@/components/top-nav";

const sessionGroups = [
  {
    workspace: "web-cli",
    branch: "main",
    items: [
      { title: "Refine Relay workspace shell", time: "10m ago", active: true },
      { title: "Define V1 TDD execution plan", time: "1h ago" },
    ],
  },
  {
    workspace: "codex",
    branch: "main",
    items: [
      { title: "Inspect app-server protocol", time: "2h ago" },
      { title: "Compare cli integration paths", time: "3h ago" },
    ],
  },
  {
    workspace: "design-notes",
    branch: "feature/notes",
    items: [{ title: "Relay naming archive", time: "yesterday" }],
  },
];

const selectedSession = {
  title: "Refine Relay workspace shell",
  workspace: "relay / web-cli",
  turns: [
    {
      role: "user",
      body: "我希望这个页面更接近截图里的风格，简洁、冷静、优雅。",
    },
    {
      role: "assistant",
      body:
        "当前问题主要是字体过大、卡片感过强、层级太松。我会先压缩字号和间距，再把左侧改成更像目录的结构。",
    },
    {
      role: "user",
      body: "左侧激活的 session 需要左边有一条细条，session 文本不要换行。",
    },
    {
      role: "assistant",
      body:
        "收到。我会把激活态收成终端目录风格，同时把 session 标题改成单行截断，branch 放回 workspace 层级。",
    },
    {
      role: "user",
      body: "右侧默认显示文件树，diff 和多余文案先删除。",
    },
    {
      role: "assistant",
      body:
        "已调整。workspace 页面现在是 workspace 分组下的 session 列表，中间输入框贴底，右侧默认只保留文件树。",
    },
  ],
};

const memoryChat = [
  {
    role: "system",
    title: "system",
    body:
      "You are organizing durable memory from one or more sessions. Keep product rules, UI constraints, and workflow habits. Exclude one-off implementation details.",
  },
  {
    role: "user",
    title: "user",
    body:
      "@Refine Relay workspace shell @Define V1 TDD execution plan 帮我整理成长期有效的产品记忆，重点保留 UI 风格和 workflow 约束。",
  },
  {
    role: "assistant",
    title: "assistant",
    body:
      "我会合并这两个 session，只保留长期有效的约束：1. Relay UI 应保持冷静、低装饰、以排版为主。2. workspace / sessions / memories / readme 是稳定的顶层信息架构。3. 文件树属于 workspace 内部上下文，不属于顶层导航。",
  },
];

export default function SessionsPage() {
  return (
    <main className="relay-app">
      <TopNav active="sessions" />

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
            <span className="eyebrow">{selectedSession.workspace}</span>
            <p className="sessions-header-copy">{selectedSession.title}</p>
          </div>

          <div className="session-thread">
            {selectedSession.turns.map((turn, index) => (
              <article className={`thread-item thread-item-${turn.role}`} key={`${turn.role}-${index}`}>
                <div className="thread-role">{turn.role}</div>
                <p>{turn.body}</p>
              </article>
            ))}
          </div>
        </section>

        <aside className="panel panel-right sessions-memory-panel">
          <div className="panel-head">
            <div className="sessions-memory-head">
              <span className="eyebrow">memory copilot</span>
            </div>
          </div>

          <section className="memory-panel">
            <div className="memory-section-head">
              <span>chat</span>
              <p>通过 `@session` 引用多个会话，让 AI 整理成可持续使用的记忆。</p>
            </div>

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
              <div className="memory-composer-input">
                @Refine Relay workspace shell @Define V1 TDD execution plan refine these into
                durable product memory...
              </div>
              <div className="memory-composer-actions">
                <button type="button">save memory</button>
                <button type="button">regenerate</button>
              </div>
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
