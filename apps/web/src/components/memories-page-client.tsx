"use client";

import { useEffect, useMemo, useState } from "react";

import type { TimelineMemory } from "@relay/shared-types";

import { getMessages } from "@/config/messages";
import type { AppLanguage } from "@/config/ui.config";
import { listMemories } from "@/lib/api/bridge";
import { renderMarkdown } from "@/lib/markdown";

type MemoriesPageClientProps = {
  language: AppLanguage;
};

type MemoriesViewMode = "date" | "theme";

export function MemoriesPageClient({ language }: MemoriesPageClientProps) {
  const messages = getMessages(language);
  const [items, setItems] = useState<TimelineMemory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<MemoriesViewMode>("date");
  const groupedByDate = useMemo(() => groupMemoriesByDate(items), [items]);
  const groupedByTheme = useMemo(() => groupMemoriesByTheme(items), [items]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedThemeKey, setSelectedThemeKey] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await listMemories();
        setItems(response.items);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load memories");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedDate && groupedByDate[0]?.date) {
      setSelectedDate(groupedByDate[0].date);
    }
  }, [groupedByDate, selectedDate]);

  useEffect(() => {
    if (!selectedThemeKey && groupedByTheme[0]?.themeKey) {
      setSelectedThemeKey(groupedByTheme[0].themeKey);
    }
  }, [groupedByTheme, selectedThemeKey]);

  const selectedGroup =
    mode === "date"
      ? groupedByDate.find((group) => group.date === selectedDate) ?? null
      : groupedByTheme.find((group) => group.themeKey === selectedThemeKey) ?? null;

  return (
    <section className="memories-page">
      <div className="memories-topbar">
        <div className="memories-heading">
          <span className="eyebrow">{messages.memories.eyebrow}</span>
        </div>
        <div className="memories-toolbar">
          <div className="memory-theme-strip memory-theme-strip-inline">
            <button
              className={`memory-theme-pill ${mode === "date" ? "memory-theme-pill-active" : ""}`}
              onClick={() => setMode("date")}
              type="button"
            >
              <span>{messages.memories.timeline}</span>
              <span>{groupedByDate.length}</span>
            </button>
            <button
              className={`memory-theme-pill ${mode === "theme" ? "memory-theme-pill-active" : ""}`}
              onClick={() => setMode("theme")}
              type="button"
            >
              <span>themes</span>
              <span>{groupedByTheme.length}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="memories-shell">
        <section className="panel panel-center memories-calendar-panel">
          {isLoading ? <div className="workspace-empty">{messages.workspace.loading}</div> : null}
          {error ? <div className="workspace-empty">{error}</div> : null}
          {!isLoading && !error ? (
            <div className="memory-day-list">
              {(mode === "date" ? groupedByDate : groupedByTheme).map((group) => {
                const active = mode === "date" ? selectedDate === group.date : selectedThemeKey === group.themeKey;
                const label = mode === "date" ? group.date : group.themeTitle;

                return (
                  <button
                    className={`memory-day-item ${active ? "memory-theme-pill-active" : ""}`}
                    key={mode === "date" ? group.date : group.themeKey}
                    onClick={() => {
                      if (mode === "date") {
                        setSelectedDate(group.date);
                      } else {
                        setSelectedThemeKey(group.themeKey);
                      }
                    }}
                    type="button"
                  >
                    <div className="memory-day-top">
                      <div className="memory-day-theme">{label}</div>
                      <span>{group.items.length}</span>
                    </div>
                    <h4>{group.items[0]?.title ?? label}</h4>
                    <span>{group.items[0]?.memoryDate ?? ""}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>

        <aside className="panel panel-right memories-detail-panel">
          <div className="panel-head">
            <span className="eyebrow">
              {mode === "date" ? selectedGroup?.date ?? "no date" : selectedGroup?.themeTitle ?? "no theme"}
            </span>
          </div>

          {selectedGroup ? (
            <>
              <section className="detail-block">
                <h2>{mode === "date" ? messages.memories.dailySummary : "theme summary"}</h2>
                <div className="memory-summary-stats">
                  <article className="memory-summary-stat">
                    <strong>{selectedGroup.items.length}</strong>
                    <span>{messages.memories.memories}</span>
                  </article>
                  <article className="memory-summary-stat">
                    <strong>{new Set(selectedGroup.items.map((item) => item.sessionId)).size}</strong>
                    <span>{messages.memories.sourceSessions}</span>
                  </article>
                </div>
              </section>

              <section className="detail-block">
                <h3>{messages.memories.memories}</h3>
                <div className="memory-day-list">
                  {selectedGroup.items.map((memory) => (
                    <article className="memory-day-item" key={memory.id}>
                      <div className="memory-day-top">
                        <div className="memory-day-theme">{memory.themeTitle}</div>
                        <span>{`${memory.checkpointTurnCount} turns`}</span>
                      </div>
                      <h4>{memory.title}</h4>
                      <div
                        className="thread-item-body"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(memory.content) }}
                      />
                    </article>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <section className="detail-block">
              <p>no memories yet</p>
            </section>
          )}
        </aside>
      </div>
    </section>
  );
}

function groupMemoriesByDate(items: TimelineMemory[]) {
  const groups = new Map<string, TimelineMemory[]>();

  for (const item of items) {
    const current = groups.get(item.memoryDate) ?? [];
    current.push(item);
    groups.set(item.memoryDate, current);
  }

  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, groupItems]) => ({
      date,
      items: groupItems.sort((a, b) => b.checkpointTurnCount - a.checkpointTurnCount),
      themeKey: groupItems[0]?.themeKey ?? date,
      themeTitle: groupItems[0]?.themeTitle ?? date,
    }));
}

function groupMemoriesByTheme(items: TimelineMemory[]) {
  const groups = new Map<string, TimelineMemory[]>();

  for (const item of items) {
    const current = groups.get(item.themeKey) ?? [];
    current.push(item);
    groups.set(item.themeKey, current);
  }

  return [...groups.entries()]
    .sort((a, b) => (b[1][0]?.updatedAt ?? "").localeCompare(a[1][0]?.updatedAt ?? ""))
    .map(([themeKey, groupItems]) => ({
      date: groupItems[0]?.memoryDate ?? "",
      themeKey,
      themeTitle: groupItems[0]?.themeTitle ?? themeKey,
      items: groupItems.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    }));
}
