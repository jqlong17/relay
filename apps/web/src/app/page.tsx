import { TopNav } from "@/components/top-nav";

export default function Home() {
  type WorkspaceSession = {
    title: string;
    active?: boolean;
  };

  const workspaces: {
    title: string;
    branch: string;
    sessions: WorkspaceSession[];
  }[] = [
    {
      title: "web-cli",
      branch: "main",
      sessions: [
        { title: "refine workspace shell", active: true },
        { title: "design sessions page" },
        { title: "memory model draft" },
      ],
    },
    {
      title: "codex",
      branch: "main",
      sessions: [
        { title: "inspect app-server protocol" },
        { title: "compare cli integration paths" },
      ],
    },
    {
      title: "design-notes",
      branch: "feature/notes",
      sessions: [{ title: "relay naming archive" }],
    },
  ];

  const timeline = [
    {
      kind: "section",
      label: "#getting started",
      title: "Relay gives you a calm web workspace for continuing local agent tasks.",
      meta: "",
    },
    {
      kind: "body",
      label: "",
      title:
        "the local runtime stays on your machine, while the browser becomes a quieter place to inspect sessions, files, diffs, and execution history.",
      meta: "",
    },
    {
      kind: "body",
      label: "",
      title:
        "this first prototype focuses on layout and tone. the left side behaves like a navigable index, the center reads like a running document, and the right side keeps current file context visible.",
      meta: "",
    },
    {
      kind: "section",
      label: "#why this layout",
      title: "a coding agent ui should feel inspectable before it feels decorative.",
      meta: "",
    },
    {
      kind: "body",
      label: "",
      title:
        "instead of oversized cards and high-contrast panels, Relay should lean on rhythm, typography, and density. that keeps the interface cold, quiet, and trustworthy.",
      meta: "",
    },
    {
      kind: "section",
      label: "#next",
      title: "the next pass can wire real session data and app-server events into the same structure without changing the visual language.",
      meta: "",
    },
  ];

  const files = [
    { label: "src", depth: 0, kind: "folder" },
    { label: "app", depth: 1, kind: "folder" },
    { label: "page.tsx", depth: 2, kind: "file", active: true },
    { label: "globals.css", depth: 2, kind: "file" },
    { label: "layout.tsx", depth: 2, kind: "file" },
    { label: "components", depth: 0, kind: "folder" },
    { label: "top-nav.tsx", depth: 1, kind: "file" },
    { label: "workflow", depth: 0, kind: "folder" },
    { label: "session", depth: 1, kind: "folder" },
    { label: "03-时间线会话记录-导航与记忆页面设计.md", depth: 2, kind: "file" },
    { label: "执行计划", depth: 1, kind: "folder" },
    { label: "01-Relay-V1-TDD执行计划.md", depth: 2, kind: "file" },
    { label: "package.json", depth: 0, kind: "file" },
  ];

  return (
    <main className="relay-app">
      <TopNav active="workspace" />

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
          <div className="timeline workspace-timeline">
            {timeline.map((item) => (
              <article className={`timeline-item timeline-item-${item.kind}`} key={item.title}>
                <div className="timeline-label">{item.label}</div>
                <div className="timeline-content">
                  <h3>{item.title}</h3>
                  {item.meta ? <p>{item.meta}</p> : null}
                </div>
              </article>
            ))}
          </div>

          <div className="composer">
            <div className="composer-prompt">relay &gt;</div>
            <div className="composer-input">ask relay to keep going...</div>
            <button className="composer-send" type="button">
              run
            </button>
          </div>
        </section>

        <aside className="panel panel-right">
          <div className="panel-head">
            <div className="tab-row">
              <button className="tab-button tab-button-active" type="button">
                files
              </button>
            </div>
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
