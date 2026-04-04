import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TimelineMemory } from "@relay/shared-types";

const bridgeMocks = vi.hoisted(() => ({
  getFilePreview: vi.fn(),
  listMemories: vi.fn(),
}));

vi.mock("@/lib/api/bridge", () => bridgeMocks);

import { MemoriesPageClient } from "@/components/memories-page-client";

const CURRENT_YEAR = new Date().getFullYear();

describe("MemoriesPageClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeMocks.listMemories.mockResolvedValue({
      items: [
        makeMemory({
          id: "memory-1",
          memoryDate: `${CURRENT_YEAR}-04-03`,
          themeTitle: "【记忆优化】",
          themeKey: "记忆优化",
          title: "记忆优化 · 20轮",
          content: "查看 [README.md](/Users/ruska/project/web-cli/README.md) 的原文。",
        }),
        makeMemory({
          id: "memory-2",
          memoryDate: `${CURRENT_YEAR}-04-02`,
          themeTitle: "【Web端开发】",
          themeKey: "web端开发",
          title: "Web端开发 · 12轮",
          checkpointTurnCount: 12,
        }),
        makeMemory({
          id: "memory-3",
          memoryDate: "2015-06-09",
          themeTitle: "【历史主题】",
          themeKey: "历史主题",
          title: "历史主题 · 8轮",
          checkpointTurnCount: 8,
        }),
      ],
    });
    bridgeMocks.getFilePreview.mockResolvedValue({
      item: {
        path: "/Users/ruska/project/web-cli/README.md",
        name: "README.md",
        content: "# README\n\npreview content",
        extension: ".md",
      },
    });
  });

  it("renders real memories and supports date/theme switching", async () => {
    render(<MemoriesPageClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(bridgeMocks.listMemories).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: new RegExp(`${CURRENT_YEAR}-04-03 \\(1\\)`) }).className,
      ).toContain("calendar-day-active");
    });
    expect(screen.getByText("记忆优化 · 20轮")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /themes/i }));

    expect(screen.getAllByText("【记忆优化】").length).toBeGreaterThan(0);
    expect(screen.getAllByText("【Web端开发】").length).toBeGreaterThan(0);
  });

  it("shows the current year by default and supports switching years", async () => {
    render(<MemoriesPageClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(bridgeMocks.listMemories).toHaveBeenCalledTimes(1);
    });

    const yearTrigger = screen.getByRole("button", { name: new RegExp(`year\\s*${CURRENT_YEAR}`) });
    expect(yearTrigger).toBeTruthy();
    expect(screen.getByText(`${CURRENT_YEAR}年1月`)).toBeTruthy();
    expect(screen.getByText(`${CURRENT_YEAR}年12月`)).toBeTruthy();
    const dateButton = screen.getByRole("button", { name: new RegExp(`${CURRENT_YEAR}-04-03 \\(1\\)`) });
    expect(dateButton.className).toContain("calendar-day");
    expect(dateButton.className).toContain("calendar-day-active");
    expect(dateButton.textContent).toContain("03");

    await user.click(yearTrigger);
    await user.click(screen.getByRole("option", { name: "2015" }));

    expect(screen.getByRole("button", { name: /year\s*2015/ })).toBeTruthy();
    expect(screen.getByText("2015年1月")).toBeTruthy();
    expect(screen.getByText("2015年12月")).toBeTruthy();
    expect(screen.getByRole("button", { name: /2015-06-09 \(1\)/ }).className).toContain("calendar-day-active");
  });

  it("opens linked files in an inline preview panel instead of navigating away", async () => {
    render(<MemoriesPageClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "README.md" })).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "README.md" }));

    await waitFor(() => {
      expect(screen.getByText("preview content")).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "关闭" }));
    await waitFor(() => {
      expect(screen.queryByText("preview content")).toBeNull();
    });
  });
});

function makeMemory(overrides: Partial<TimelineMemory> = {}): TimelineMemory {
  return {
    id: "memory-1",
    sessionId: "session-1",
    workspaceId: "workspace-1",
    themeTitle: "【记忆优化】",
    themeKey: "记忆优化",
    sessionTitleSnapshot: "【记忆优化】",
    memoryDate: "2026-04-03",
    checkpointTurnCount: 20,
    promptVersion: "timeline-memory/v1",
    title: "时间线记忆",
    content: "memory content",
    status: "completed",
    sourceThreadUpdatedAt: "2026-04-03T00:00:00.000Z",
    createdAt: "2026-04-03T00:00:00.000Z",
    updatedAt: "2026-04-03T00:00:00.000Z",
    generationError: null,
    ...overrides,
  };
}
