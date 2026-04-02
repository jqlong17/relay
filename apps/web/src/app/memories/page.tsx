import { TopNav } from "@/components/top-nav";

const themes = [
  { label: "ui style", count: 7 },
  { label: "workflow", count: 5 },
  { label: "project rules", count: 4 },
  { label: "preferences", count: 3 },
  { label: "commands", count: 2 },
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
  summary: "2 durable memories were produced from 1 session and 1 manual refinement prompt.",
  memories: [
    {
      theme: "ui style",
      title: "Relay UI should stay typography-led and low-decoration.",
      source: "session: Refine Relay workspace shell",
    },
    {
      theme: "project rules",
      title: "Keep files contextual inside workspace rather than as a top-level navigation object.",
      source: "session: Refine Relay workspace shell",
    },
  ],
};

export default function MemoriesPage() {
  return (
    <main className="relay-app">
      <TopNav active="memories" />

      <section className="memories-page">
        <div className="memories-topbar">
          <div>
            <span className="eyebrow">memory calendar</span>
            <h1>Continuous timeline</h1>
          </div>
          <div className="memories-stats">
            <span>21 saved</span>
            <span>5 themes</span>
            <span>2 used today</span>
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
              <span className="eyebrow">months</span>
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
              <p>{selectedDay.summary}</p>
            </section>

            <section className="detail-block">
              <h3>memories</h3>
              <div className="memory-day-list">
                {selectedDay.memories.map((memory) => (
                  <article className="memory-day-item" key={memory.title}>
                    <div className="memory-day-theme">{memory.theme}</div>
                    <h4>{memory.title}</h4>
                    <span>{memory.source}</span>
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
