import type { TimelineMemory } from "@relay/shared-types";

const EARLIEST_MEMORY_YEAR = 2015;

type MemoryDateGroup = {
  date: string;
  items: TimelineMemory[];
  themeKey: string;
  themeTitle: string;
};

type CalendarDay = {
  date: string;
  dayLabel: string;
  count: number;
};

type CalendarMonth = {
  month: number;
  label: string;
  days: CalendarDay[];
};

type CalendarWeekCell =
  | {
      kind: "empty";
      key: string;
    }
  | ({
      kind: "day";
    } & CalendarDay);

type CalendarMonthWithWeeks = {
  month: number;
  label: string;
  cells: CalendarWeekCell[];
};

function groupMemoriesByDate(items: TimelineMemory[]): MemoryDateGroup[] {
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

function buildCalendarMonths(
  year: number,
  groups: MemoryDateGroup[],
  locale = "zh-CN",
  options?: { includeYear?: boolean },
): CalendarMonth[] {
  const dateCounts = new Map(groups.map((group) => [group.date, group.items.length]));

  return Array.from({ length: 12 }, (_, monthIndex) => {
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const label = new Intl.DateTimeFormat(locale, options?.includeYear === false ? { month: "long" } : {
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

function buildCalendarMonthsWithWeeks(year: number, groups: MemoryDateGroup[], locale = "zh-CN"): CalendarMonthWithWeeks[] {
  return buildCalendarMonths(year, groups, locale, { includeYear: false }).map((month) => {
    const firstDayOffset = (new Date(year, month.month, 1).getDay() + 6) % 7;
    const cells: CalendarWeekCell[] = [];

    for (let index = 0; index < firstDayOffset; index += 1) {
      cells.push({
        kind: "empty",
        key: `${month.month}-leading-${index}`,
      });
    }

    for (const day of month.days) {
      cells.push({
        kind: "day",
        ...day,
      });
    }

    const trailingCellCount = (7 - (cells.length % 7)) % 7;
    for (let index = 0; index < trailingCellCount; index += 1) {
      cells.push({
        kind: "empty",
        key: `${month.month}-trailing-${index}`,
      });
    }

    return {
      month: month.month,
      label: month.label,
      cells,
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

export type { CalendarMonth, CalendarMonthWithWeeks, MemoryDateGroup };
export { buildCalendarMonths, buildCalendarMonthsWithWeeks, buildSelectableYears, getCalendarLevelClass, groupMemoriesByDate };
