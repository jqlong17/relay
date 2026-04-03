import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TimelineMemory } from "@relay/shared-types";

const bridgeMocks = vi.hoisted(() => ({
  listMemories: vi.fn(),
}));

vi.mock("@/lib/api/bridge", () => bridgeMocks);

import { MemoriesPageClient } from "@/components/memories-page-client";

describe("MemoriesPageClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeMocks.listMemories.mockResolvedValue({
      items: [
        makeMemory({
          id: "memory-1",
          memoryDate: "2026-04-03",
          themeTitle: "【记忆优化】",
          themeKey: "记忆优化",
          title: "记忆优化 · 20轮",
        }),
        makeMemory({
          id: "memory-2",
          memoryDate: "2026-04-02",
          themeTitle: "【Web端开发】",
          themeKey: "web端开发",
          title: "Web端开发 · 12轮",
          checkpointTurnCount: 12,
        }),
      ],
    });
  });

  it("renders real memories and supports date/theme switching", async () => {
    render(<MemoriesPageClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(bridgeMocks.listMemories).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText("记忆优化 · 20轮")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /themes/i }));

    expect(screen.getAllByText("【记忆优化】").length).toBeGreaterThan(0);
    expect(screen.getAllByText("【Web端开发】").length).toBeGreaterThan(0);
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
