"use client";

import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";

import type { TimelineMemory } from "@relay/shared-types";

import { MobileDrawer } from "@/components/mobile/mobile-drawer-kit";
import { listMemories } from "@/lib/api/bridge";
import { buildCalendarMonthsWithWeeks, buildSelectableYears, getCalendarLevelClass, groupMemoriesByDate } from "@/lib/memories";
import { renderMarkdown } from "@/lib/markdown";

type MobileMemoriesDrawerProps = {
  closeLabel: string;
  detailTitleLabel: string;
  emptyLabel: string;
  isOpen: boolean;
  loadingLabel: string;
  memoriesLabel: string;
  noDetailsLabel: string;
  sourceSessionsLabel: string;
  title: string;
  yearLabel: string;
  weekdays: readonly string[];
  locale: string;
  onClose: () => void;
};

export function MobileMemoriesDrawer({
  closeLabel,
  detailTitleLabel,
  emptyLabel,
  isOpen,
  loadingLabel,
  memoriesLabel,
  noDetailsLabel,
  sourceSessionsLabel,
  title,
  yearLabel,
  weekdays,
  locale,
  onClose,
}: MobileMemoriesDrawerProps) {
  const currentYear = new Date().getFullYear();
  const [items, setItems] = useState<TimelineMemory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [isYearPickerOpen, setIsYearPickerOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const yearPickerRef = useRef<HTMLDivElement | null>(null);
  const hasLoadedRef = useRef(false);
  const groupedByDate = useMemo(() => groupMemoriesByDate(items), [items]);
  const selectableYears = useMemo(() => buildSelectableYears(items, currentYear), [items, currentYear]);
  const filteredDateGroups = useMemo(
    () => groupedByDate.filter((group) => Number.parseInt(group.date.slice(0, 4), 10) === selectedYear),
    [groupedByDate, selectedYear],
  );
  const calendarMonths = useMemo(
    () => buildCalendarMonthsWithWeeks(selectedYear, filteredDateGroups, locale),
    [filteredDateGroups, locale, selectedYear],
  );
  const selectedGroup = selectedDate ? filteredDateGroups.find((group) => group.date === selectedDate) ?? null : null;

  useEffect(() => {
    if (!isOpen || hasLoadedRef.current) {
      return;
    }

    hasLoadedRef.current = true;
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
  }, [isOpen]);

  useEffect(() => {
    if (!selectableYears.includes(selectedYear)) {
      setSelectedYear(selectableYears[0] ?? currentYear);
    }
  }, [currentYear, selectableYears, selectedYear]);

  useEffect(() => {
    setSelectedDate(null);
  }, [selectedYear]);

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

  function handleMarkdownLinkClick(event: MouseEvent<HTMLElement>) {
    const target = event.target instanceof HTMLElement ? event.target.closest("a") : null;
    if (!target) {
      return;
    }
  }

  return (
    <MobileDrawer
      closeAriaLabel="close memories"
      closeLabel={closeLabel}
      headerAction={
        <div className="mobile-memory-year-picker" ref={yearPickerRef}>
          <button
            aria-expanded={isYearPickerOpen}
            aria-haspopup="listbox"
            className={`mobile-memory-year-trigger ${isYearPickerOpen ? "mobile-memory-year-trigger-active" : ""}`}
            onClick={() => setIsYearPickerOpen((current) => !current)}
            type="button"
          >
            <span>{yearLabel}</span>
            <strong>{selectedYear}</strong>
          </button>
          {isYearPickerOpen ? (
            <div className="mobile-memory-year-menu" role="listbox" aria-label="memory years">
              {selectableYears.map((year) => (
                <button
                  aria-selected={selectedYear === year}
                  className={`mobile-memory-year-option ${selectedYear === year ? "mobile-memory-year-option-active" : ""}`}
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
      }
      isOpen={isOpen}
      onClose={onClose}
      title={title}
    >
      <div className="mobile-memory-shell">
        <div className="mobile-memory-calendar-scroll">
          {isLoading ? <div className="mobile-memory-empty">{loadingLabel}</div> : null}
          {error ? <div className="mobile-memory-empty">{error}</div> : null}
          {!isLoading && !error ? (
            <div className="mobile-memory-month-list">
              {calendarMonths.map((month) => (
                <section className="mobile-memory-month-block" key={month.month}>
                  <h3 className="mobile-memory-month-title">{month.label}</h3>
                  <div className="mobile-memory-weekdays" aria-hidden="true">
                    {weekdays.map((weekday) => (
                      <span key={weekday}>{weekday}</span>
                    ))}
                  </div>
                  <div className="mobile-memory-grid">
                    {month.cells.map((cell) =>
                      cell.kind === "empty" ? (
                        <span className="mobile-memory-day mobile-memory-day-empty" key={cell.key} />
                      ) : (
                        <button
                          aria-label={`${cell.date} (${cell.count})`}
                          className={`mobile-memory-day ${getCalendarLevelClass(cell.count, groupedByDate)} ${selectedDate === cell.date ? "calendar-day-active" : ""}`}
                          key={cell.date}
                          onClick={() => setSelectedDate(cell.date)}
                          type="button"
                        >
                          <span className="mobile-memory-day-number">{cell.dayLabel}</span>
                          <span className="mobile-memory-day-count">{cell.count > 0 ? cell.count : ""}</span>
                        </button>
                      ),
                    )}
                  </div>
                </section>
              ))}
            </div>
          ) : null}
        </div>

        {selectedDate ? (
          <section className="mobile-memory-detail-sheet">
            <div className="mobile-memory-detail-head">
              <div className="mobile-memory-detail-head-copy">
                <span className="mobile-memory-detail-eyebrow">{selectedDate}</span>
                {selectedGroup ? (
                  <div className="mobile-memory-detail-meta">
                    <span>{selectedGroup.items.length} {memoriesLabel}</span>
                    <span>{new Set(selectedGroup.items.map((item) => item.sessionId)).size} {sourceSessionsLabel}</span>
                  </div>
                ) : null}
              </div>
              <button className="mobile-memory-detail-close" onClick={() => setSelectedDate(null)} type="button">
                {closeLabel}
              </button>
            </div>

            <div className="mobile-memory-detail-scroll">
              {selectedGroup ? (
                <>
                  <section className="mobile-memory-detail-block">
                    <h2>{detailTitleLabel}</h2>
                  </section>

                  <section className="mobile-memory-detail-block">
                    <div className="memory-day-list mobile-memory-card-list">
                      {selectedGroup.items.map((memory) => (
                        <article className="memory-day-item mobile-memory-card" key={memory.id}>
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
                <section className="mobile-memory-detail-block">
                  <p>{noDetailsLabel}</p>
                </section>
              )}
            </div>
          </section>
        ) : null}

        {!isLoading && !error && items.length === 0 ? <div className="mobile-memory-empty">{emptyLabel}</div> : null}
      </div>
    </MobileDrawer>
  );
}
