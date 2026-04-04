"use client";

import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";

import type { TimelineMemory } from "@relay/shared-types";

import { getMessages } from "@/config/messages";
import type { AppLanguage } from "@/config/ui.config";
import { getFilePreview, listMemories } from "@/lib/api/bridge";
import type { FilePreview } from "@/lib/api/bridge";
import { renderMarkdown } from "@/lib/markdown";

type MemoriesPageClientProps = {
  language: AppLanguage;
};

type MemoriesViewMode = "date" | "theme";
const EARLIEST_MEMORY_YEAR = 2015;

export function MemoriesPageClient({ language }: MemoriesPageClientProps) {
  const messages = getMessages(language);
  const calendarYear = new Date().getFullYear();
  const [items, setItems] = useState<TimelineMemory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<MemoriesViewMode>("date");
  const groupedByDate = useMemo(() => groupMemoriesByDate(items), [items]);
  const groupedByTheme = useMemo(() => groupMemoriesByTheme(items), [items]);
  const selectableYears = useMemo(() => buildSelectableYears(items, calendarYear), [items, calendarYear]);
  const [selectedYear, setSelectedYear] = useState(calendarYear);
  const [isYearPickerOpen, setIsYearPickerOpen] = useState(false);
  const yearPickerRef = useRef<HTMLDivElement | null>(null);
  const detailPanelRef = useRef<HTMLElement | null>(null);
  const filteredDateGroups = useMemo(
    () => groupedByDate.filter((group) => Number.parseInt(group.date.slice(0, 4), 10) === selectedYear),
    [groupedByDate, selectedYear],
  );
  const calendarMonths = useMemo(() => buildCalendarMonths(selectedYear, filteredDateGroups), [selectedYear, filteredDateGroups]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedThemeKey, setSelectedThemeKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewHtml = useMemo(() => {
    if (!preview || preview.extension !== ".md") {
      return null;
    }

    return renderMarkdown(preview.content);
  }, [preview]);

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
    if (!selectableYears.includes(selectedYear)) {
      setSelectedYear(selectableYears[0] ?? calendarYear);
    }
  }, [calendarYear, selectableYears, selectedYear]);

  useEffect(() => {
    const hasSelectedDate = selectedDate ? filteredDateGroups.some((group) => group.date === selectedDate) : false;

    if (!hasSelectedDate && filteredDateGroups[0]?.date) {
      setSelectedDate(filteredDateGroups[0].date);
    }
  }, [filteredDateGroups, selectedDate]);

  useEffect(() => {
    const hasSelectedTheme = selectedThemeKey ? groupedByTheme.some((group) => group.themeKey === selectedThemeKey) : false;

    if (!hasSelectedTheme && groupedByTheme[0]?.themeKey) {
      setSelectedThemeKey(groupedByTheme[0].themeKey);
    }
  }, [groupedByTheme, selectedThemeKey]);

  useEffect(() => {
    if (mode !== "date") {
      setIsYearPickerOpen(false);
    }
  }, [mode]);

  useEffect(() => {
    if (!preview) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreview(null);
        setPreviewError(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [preview]);

  useEffect(() => {
    if (!isYearPickerOpen) {
      return;
    }

    const handlePointerDown = (event: globalThis.MouseEvent) => {
      if (!yearPickerRef.current?.contains(event.target as Node)) {
        setIsYearPickerOpen(false);
      }
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsYearPickerOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isYearPickerOpen]);

  const effectiveSelectedDate =
    selectedDate && filteredDateGroups.some((group) => group.date === selectedDate)
      ? selectedDate
      : filteredDateGroups[0]?.date ?? `${selectedYear}-01-01`;
  const effectiveSelectedThemeKey =
    selectedThemeKey && groupedByTheme.some((group) => group.themeKey === selectedThemeKey)
      ? selectedThemeKey
      : groupedByTheme[0]?.themeKey ?? null;

  const selectedGroup =
    mode === "date"
      ? filteredDateGroups.find((group) => group.date === effectiveSelectedDate) ?? null
      : groupedByTheme.find((group) => group.themeKey === effectiveSelectedThemeKey) ?? null;

  async function handleOpenPreview(filePath: string) {
    try {
      setPreviewError(null);
      setIsPreviewLoading(true);
      const response = await getFilePreview(filePath);
      setPreview(response.item);
    } catch (loadError) {
      setPreview(null);
      setPreviewError(loadError instanceof Error ? loadError.message : "Failed to load preview");
    } finally {
      setIsPreviewLoading(false);
    }
  }

  function findFileLink(target: EventTarget | null) {
    const element =
      target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
    const link = element?.closest("[data-file-link='true']");

    if (!(link instanceof HTMLElement)) {
      return null;
    }

    return link;
  }

  function handleMarkdownLinkClick(event: MouseEvent<HTMLElement>) {
    const link = findFileLink(event.target);
    const filePath = link?.getAttribute("data-file-path");
    if (!link || !filePath) {
      return;
    }

    event.preventDefault();
    void handleOpenPreview(filePath);
  }

  useEffect(() => {
    const detailPanel = detailPanelRef.current;
    if (!detailPanel) {
      return;
    }

    const handleNativeClick = (event: Event) => {
      const link = findFileLink(event.target);
      const filePath = link?.getAttribute("data-file-path");
      if (!link || !filePath) {
        return;
      }

      event.preventDefault();
      void handleOpenPreview(filePath);
    };

    detailPanel.addEventListener("click", handleNativeClick);
    return () => {
      detailPanel.removeEventListener("click", handleNativeClick);
    };
  }, []);

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
          {!isLoading && !error && mode === "date" ? (
            <>
              <div className="memories-calendar-head">
                <span className="eyebrow">{selectedYear}</span>
                <div className="memories-year-picker" ref={yearPickerRef}>
                  <button
                    aria-expanded={isYearPickerOpen}
                    aria-haspopup="listbox"
                    className={`memories-year-trigger ${isYearPickerOpen ? "memories-year-trigger-active" : ""}`}
                    onClick={() => setIsYearPickerOpen((current) => !current)}
                    type="button"
                  >
                    <span>year</span>
                    <strong>{selectedYear}</strong>
                  </button>
                  {isYearPickerOpen ? (
                    <div className="memories-year-menu" role="listbox" aria-label="memory years">
                      {selectableYears.map((year) => (
                        <button
                          aria-selected={selectedYear === year}
                          className={`memories-year-option ${selectedYear === year ? "memories-year-option-active" : ""}`}
                          key={year}
                          onClick={() => {
                            setSelectedYear(year);
                            setIsYearPickerOpen(false);
                          }}
                          role="option"
                          type="button"
                        >
                          {year}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="calendar-month-list">
                {calendarMonths.map((month) => (
                  <section className="calendar-month-block" key={month.month}>
                    <h3 className="calendar-month-title">{month.label}</h3>
                    <div className="calendar-grid memories-date-grid">
                      {month.days.map((day) => (
                        <button
                          aria-label={`${day.date} (${day.count})`}
                          className={`calendar-day ${getCalendarLevelClass(day.count, groupedByDate)} ${effectiveSelectedDate === day.date ? "calendar-day-active" : ""}`}
                          key={day.date}
                          onClick={() => setSelectedDate(day.date)}
                          type="button"
                        >
                          <span className="calendar-day-number">{day.dayLabel}</span>
                          <span className="calendar-day-count">{day.count > 0 ? day.count : ""}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </>
          ) : null}
          {!isLoading && !error && mode === "theme" ? (
            <div className="memory-day-list">
              {groupedByTheme.map((group) => {
                const active = selectedThemeKey === group.themeKey;

                return (
                  <button
                    className={`memory-day-item ${active ? "memory-theme-pill-active" : ""}`}
                    key={group.themeKey}
                    onClick={() => setSelectedThemeKey(group.themeKey)}
                    type="button"
                  >
                    <div className="memory-day-top">
                      <div className="memory-day-theme">{group.themeTitle}</div>
                      <span>{group.items.length}</span>
                    </div>
                    <h4>{group.items[0]?.title ?? group.themeTitle}</h4>
                    <span>{group.items[0]?.memoryDate ?? ""}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>

        <aside className="panel panel-right memories-detail-panel" ref={detailPanelRef}>
          <div className="panel-head memories-detail-head">
            <span className="eyebrow">
              {mode === "date" ? selectedGroup?.date ?? "no date" : selectedGroup?.themeTitle ?? "no theme"}
            </span>
            {selectedGroup ? (
              <div className="memory-summary-inline">
                <span>{selectedGroup.items.length} {messages.memories.memories}</span>
                <span>{new Set(selectedGroup.items.map((item) => item.sessionId)).size} {messages.memories.sourceSessions}</span>
              </div>
            ) : null}
          </div>

          <div
            className={`memories-detail-body ${preview || isPreviewLoading || previewError ? "memories-detail-body-with-preview" : ""}`}
            onClick={(event) => {
              if (preview || isPreviewLoading || previewError) {
                if (event.target === event.currentTarget) {
                  setPreview(null);
                  setPreviewError(null);
                }
              }
            }}
          >
            <div className="memories-detail-scroll">
              {selectedGroup ? (
                <>
                  <section className="detail-block">
                    <h2>{mode === "date" ? messages.memories.dailySummary : "theme summary"}</h2>
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
                            onClick={handleMarkdownLinkClick}
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
            </div>

            {preview || isPreviewLoading || previewError ? (
              <section className="workspace-preview-column memories-preview-sheet">
                <div className="workspace-sidepanel-subhead">
                  <span className="eyebrow">{preview?.name ?? (language === "zh" ? "文件预览" : "File preview")}</span>
                  {preview || previewError ? (
                    <button
                      className="workspace-preview-close"
                      onClick={() => {
                        setPreview(null);
                        setPreviewError(null);
                      }}
                      type="button"
                    >
                      {language === "zh" ? "关闭" : "Close"}
                    </button>
                  ) : null}
                </div>

                <div className="workspace-preview-body">
                  {isPreviewLoading ? <div className="workspace-empty">{messages.workspace.loadingPreview}</div> : null}
                  {!isPreviewLoading && previewError ? <div className="workspace-empty">{previewError}</div> : null}
                  {!isPreviewLoading && !previewError && preview ? (
                    preview.extension === ".md" ? (
                      <div
                        className="file-preview-markdown"
                        dangerouslySetInnerHTML={{ __html: previewHtml ?? "" }}
                        onClick={handleMarkdownLinkClick}
                      />
                    ) : (
                      <pre className="file-preview-pre">{preview.content}</pre>
                    )
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>
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

function getCalendarLevelClass(count: number, groups: Array<{ items: TimelineMemory[] }>) {
  const maxCount = Math.max(...groups.map((group) => group.items.length), 1);
  const ratio = count / maxCount;

  if (ratio >= 0.75) {
    return "calendar-day-3";
  }

  if (ratio >= 0.5) {
    return "calendar-day-2";
  }

  if (ratio > 0) {
    return "calendar-day-1";
  }

  return "calendar-day-0";
}

function buildCalendarMonths(year: number, groups: ReturnType<typeof groupMemoriesByDate>) {
  const dateCounts = new Map(groups.map((group) => [group.date, group.items.length]));

  return Array.from({ length: 12 }, (_, monthIndex) => {
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const label = new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "long",
    }).format(new Date(year, monthIndex, 1));

    return {
      month: monthIndex,
      label,
      days: Array.from({ length: daysInMonth }, (_, dayIndex) => {
        const dayNumber = dayIndex + 1;
        const date = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;

        return {
          date,
          dayLabel: String(dayNumber).padStart(2, "0"),
          count: dateCounts.get(date) ?? 0,
        };
      }),
    };
  });
}

function buildSelectableYears(items: TimelineMemory[], currentYear: number) {
  const years = items
    .map((item) => Number.parseInt(item.memoryDate.slice(0, 4), 10))
    .filter((year) => Number.isFinite(year));
  const minYear = Math.min(EARLIEST_MEMORY_YEAR, currentYear, ...years);
  const maxYear = Math.max(currentYear, ...years);

  return Array.from({ length: maxYear - minYear + 1 }, (_, index) => maxYear - index);
}
