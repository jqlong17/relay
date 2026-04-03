import { getMessages } from "@/config/messages";
import { loadUiConfig } from "@/config/ui.config";

export default function MemoriesPage() {
  const uiConfig = loadUiConfig();
  const messages = getMessages(uiConfig.language);
  const themes = messages.memories.themes;
  const months = messages.memories.months;
  const selectedDay = messages.memories.selectedDay;
  const memoryAutomation = messages.memories.automationRules;

  return (
    <section className="memories-page">
      <div className="memories-topbar">
        <div className="memories-heading">
          <span className="eyebrow">{messages.memories.eyebrow}</span>
        </div>
        <div className="memories-toolbar">
          <div className="memories-actions">
            <button type="button">{messages.common.runNow}</button>
          </div>
        </div>
      </div>

      <div className="memories-shell">
        <section className="panel panel-center memories-calendar-panel">
          <div className="calendar-head">
            <span className="eyebrow">{messages.memories.timeline}</span>
            <div className="calendar-legend">
              <span>{messages.common.less}</span>
              <i className="calendar-level calendar-level-0" />
              <i className="calendar-level calendar-level-1" />
              <i className="calendar-level calendar-level-2" />
              <i className="calendar-level calendar-level-3" />
              <span>{messages.common.more}</span>
            </div>
          </div>

          <div className="memory-theme-strip memory-theme-strip-inline">
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

          <div className="calendar-month-list">
            {months.map((month) => (
              <section className="calendar-month" key={month.label}>
                <div className="calendar-month-title">{month.label}</div>
                <div className="calendar-grid">
                  {month.days.map((day) => (
                    <button
                      className={`calendar-day calendar-day-${day.level} ${
                        "active" in day && day.active ? "calendar-day-active" : ""
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
            <h2>{messages.memories.dailySummary}</h2>
            <div className="memory-summary-stats">
              {selectedDay.stats.map((item) => (
                <article className="memory-summary-stat" key={item.label}>
                  <strong>{item.value}</strong>
                  <span>{messages.memories.labels[item.label]}</span>
                </article>
              ))}
            </div>
            <p>{selectedDay.summary}</p>
          </section>

          <section className="detail-block">
            <h3>{messages.memories.memories}</h3>
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
            <h3>{messages.memories.sourceSessions}</h3>
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
                    <span>{messages.memories.labels.usedForSynthesis}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="detail-block">
            <div className="memory-automation-head">
              <h3>{messages.memories.automation}</h3>
              <div className="memory-automation-actions">
                <span>{messages.memories.automationSummary}</span>
                <button type="button">{messages.common.runNow}</button>
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
                    <span>{`${messages.memories.labels.last}: ${rule.lastRun}`}</span>
                    <span>{`${messages.memories.labels.next}: ${rule.nextRun}`}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
