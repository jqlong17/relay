import { TopNav } from "@/components/top-nav";

const themes = [
  { label: "all", count: 21 },
  { label: "ui style", count: 7 },
  { label: "workflow", count: 5 },
  { label: "project rules", count: 4 },
  { label: "preferences", count: 3 },
  { label: "manual", count: 2 },
];

const months = [
  {
    label: "February 2026",
    days: [
      { day: "01", level: 0 },
      { day: "02", level: 1 },
      { day: "03", level: 0 },
      { day: "04", level: 2 },
      { day: "05", level: 0 },
      { day: "06", level: 0 },
      { day: "07", level: 1 },
      { day: "08", level: 0 },
      { day: "09", level: 0 },
      { day: "10", level: 1 },
      { day: "11", level: 0 },
      { day: "12", level: 0 },
      { day: "13", level: 1 },
      { day: "14", level: 0 },
      { day: "15", level: 1 },
      { day: "16", level: 0 },
      { day: "17", level: 0 },
      { day: "18", level: 0 },
      { day: "19", level: 1 },
      { day: "20", level: 0 },
      { day: "21", level: 0 },
      { day: "22", level: 2 },
      { day: "23", level: 0 },
      { day: "24", level: 0 },
      { day: "25", level: 1 },
      { day: "26", level: 0 },
      { day: "27", level: 0 },
      { day: "28", level: 1 },
    ],
  },
  {
    label: "March 2026",
    days: [
      { day: "01", level: 0 },
      { day: "02", level: 0 },
      { day: "03", level: 1 },
      { day: "04", level: 0 },
      { day: "05", level: 2 },
      { day: "06", level: 0 },
      { day: "07", level: 0 },
      { day: "08", level: 0 },
      { day: "09", level: 1 },
      { day: "10", level: 0 },
      { day: "11", level: 0 },
      { day: "12", level: 2 },
      { day: "13", level: 0 },
      { day: "14", level: 0 },
      { day: "15", level: 1 },
      { day: "16", level: 0 },
      { day: "17", level: 0 },
      { day: "18", level: 0 },
      { day: "19", level: 1 },
      { day: "20", level: 0 },
      { day: "21", level: 2 },
      { day: "22", level: 0 },
      { day: "23", level: 0 },
      { day: "24", level: 1 },
      { day: "25", level: 0 },
      { day: "26", level: 0 },
      { day: "27", level: 0 },
      { day: "28", level: 1 },
      { day: "29", level: 0 },
      { day: "30", level: 0 },
      { day: "31", level: 1 },
    ],
  },
  {
    label: "April 2026",
    days: [
      { day: "01", level: 0 },
      { day: "02", level: 1 },
      { day: "03", level: 0 },
      { day: "04", level: 2 },
      { day: "05", level: 0 },
      { day: "06", level: 0 },
      { day: "07", level: 1 },
      { day: "08", level: 0 },
      { day: "09", level: 0 },
      { day: "10", level: 3, active: true },
      { day: "11", level: 0 },
      { day: "12", level: 0 },
      { day: "13", level: 1 },
      { day: "14", level: 0 },
      { day: "15", level: 2 },
      { day: "16", level: 0 },
      { day: "17", level: 0 },
      { day: "18", level: 0 },
      { day: "19", level: 1 },
      { day: "20", level: 0 },
      { day: "21", level: 0 },
      { day: "22", level: 2 },
      { day: "23", level: 0 },
      { day: "24", level: 0 },
      { day: "25", level: 1 },
      { day: "26", level: 0 },
      { day: "27", level: 0 },
      { day: "28", level: 1 },
      { day: "29", level: 0 },
      { day: "30", level: 0 },
    ],
  },
];

const selectedDay = {
  date: "2026-04-10",
  summary:
    "2 durable memories were produced from 1 source session. 1 item was auto-saved by rule, then refined once manually.",
  stats: [
    { label: "created", value: "2" },
    { label: "source sessions", value: "1" },
    { label: "manual edits", value: "1" },
  ],
  memories: [
    {
      theme: "ui style",
      title: "Relay UI should stay typography-led and low-decoration.",
      source: "session: Refine Relay workspace shell",
      mode: "auto + refined",
    },
    {
      theme: "project rules",
      title: "Keep files contextual inside workspace rather than as a top-level navigation object.",
      source: "session: Refine Relay workspace shell",
      mode: "auto",
    },
  ],
  sources: [
    {
      title: "Refine Relay workspace shell",
      workspace: "web-cli",
      turns: "24 turns",
      usedAt: "20:48",
    },
  ],
};

const memoryAutomation = [
  {
    title: "按轮次自动整理",
    summary: "每 20 轮对话自动生成 memory",
    value: "20",
    suffix: "turns",
    status: "active",
    lastRun: "today 20:48",
    nextRun: "after 16 more turns",
  },
  {
    title: "按时间固定整理",
    summary: "每 1 日 21:00 自动执行整理",
    value: "1d",
    suffix: "21:00",
    status: "active",
    lastRun: "yesterday 21:00",
    nextRun: "today 21:00",
  },
  {
    title: "按内容命中整理",
    summary: "命中整理记忆 / summarize memory / save memory 时触发",
    value: "3",
    suffix: "phrases",
    status: "rule",
    lastRun: "today 19:12",
    nextRun: "on keyword hit",
  },
];

export default function MemoriesPage() {
  return (
    <main className="relay-app">
      <TopNav active="memories" />

      <section className="memories-page">
        <div className="memories-topbar">
          <div className="memories-heading">
            <span className="eyebrow">memory calendar</span>
          </div>
          <div className="memories-toolbar">
            <div className="memories-actions">
              <button type="button">run now</button>
            </div>
          </div>
        </div>

        <div className="memory-theme-strip">
          {themes.map((theme, index) => (
            <button
              className={`memory-theme-pill ${index === 0 ? "memory-theme-pill-active" : ""}`}
              key={theme.label}
              type="button"
            >
              <span>{theme.label}</span>
              <span>{theme.count}</span>
            </button>
          ))}
        </div>

        <div className="memories-shell">
          <section className="panel panel-center memories-calendar-panel">
            <div className="calendar-head">
              <div className="calendar-head-copy">
                <span className="eyebrow">timeline</span>
                <p>按日期浏览，只高亮存在 memory 产出的日子。</p>
              </div>
              <div className="calendar-legend">
                <span>less</span>
                <i className="calendar-level calendar-level-0" />
                <i className="calendar-level calendar-level-1" />
                <i className="calendar-level calendar-level-2" />
                <i className="calendar-level calendar-level-3" />
                <span>more</span>
              </div>
            </div>

            <div className="calendar-month-list">
              {months.map((month) => (
                <section className="calendar-month" key={month.label}>
                  <div className="calendar-month-title">{month.label}</div>
                  <div className="calendar-grid">
                    {month.days.map((day) => (
                      <button
                        className={`calendar-day calendar-day-${day.level} ${
                          day.active ? "calendar-day-active" : ""
                        }`}
                        key={`${month.label}-${day.day}`}
                        type="button"
                      >
                        <span>{day.day}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>

          <aside className="panel panel-right memories-detail-panel">
            <div className="panel-head">
              <span className="eyebrow">{selectedDay.date}</span>
            </div>

            <section className="detail-block">
              <h2>daily summary</h2>
              <div className="memory-summary-stats">
                {selectedDay.stats.map((item) => (
                  <article className="memory-summary-stat" key={item.label}>
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                  </article>
                ))}
              </div>
              <p>{selectedDay.summary}</p>
            </section>

            <section className="detail-block">
              <h3>memories</h3>
              <div className="memory-day-list">
                {selectedDay.memories.map((memory) => (
                  <article className="memory-day-item" key={memory.title}>
                    <div className="memory-day-top">
                      <div className="memory-day-theme">{memory.theme}</div>
                      <span>{memory.mode}</span>
                    </div>
                    <h4>{memory.title}</h4>
                    <span>{memory.source}</span>
                  </article>
                ))}
              </div>
            </section>

            <section className="detail-block">
              <h3>source sessions</h3>
              <div className="memory-source-list">
                {selectedDay.sources.map((source) => (
                  <article className="memory-source-item" key={source.title}>
                    <div className="memory-source-top">
                      <h4>{source.title}</h4>
                      <span>{source.usedAt}</span>
                    </div>
                    <p>{source.workspace}</p>
                    <div className="memory-source-meta">
                      <span>{source.turns}</span>
                      <span>used for synthesis</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="detail-block">
              <div className="memory-automation-head">
                <h3>automation</h3>
                <div className="memory-automation-actions">
                  <span>3 active</span>
                  <button type="button">run now</button>
                </div>
              </div>
              <div className="memory-automation-list">
                {memoryAutomation.map((rule) => (
                  <article className="memory-automation-item" key={rule.title}>
                    <div className="memory-automation-top">
                      <h4>{rule.title}</h4>
                      <span>{rule.status}</span>
                    </div>
                    <p>{rule.summary}</p>
                    <div className="memory-automation-value">
                      <strong>{rule.value}</strong>
                      <em>{rule.suffix}</em>
                    </div>
                    <div className="memory-automation-meta">
                      <span>last: {rule.lastRun}</span>
                      <span>next: {rule.nextRun}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
