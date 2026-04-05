import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Session, TimelineMemory, Workspace } from "@relay/shared-types";

const bridgeMocks = vi.hoisted(() => ({
  generateSessionMemory: vi.fn(),
  getSession: vi.fn(),
  getSessionMemories: vi.fn(),
  listSessions: vi.fn(),
  listWorkspaces: vi.fn(),
  openWorkspace: vi.fn(),
  selectSession: vi.fn(),
}));

vi.mock("@/lib/api/bridge", () => bridgeMocks);

import { SessionsClient } from "@/components/sessions-client";

describe("SessionsClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    bridgeMocks.listWorkspaces.mockResolvedValue({
      items: [makeWorkspace()],
      active: makeWorkspace(),
    });
    bridgeMocks.listSessions.mockResolvedValue({
      items: [makeSession()],
      activeWorkspaceId: "workspace-1",
      preferredSessionId: "session-1",
    });
    bridgeMocks.getSession.mockResolvedValue({
      item: makeSession({
        messages: [],
      }),
      source: "fresh",
    });
    bridgeMocks.getSessionMemories.mockResolvedValue({
      items: [
        makeMemory({
          title: "【记忆优化】 · 20轮时间线记忆",
          content: "记录了 `apps/web/src/components/sessions-client.tsx` 的整理结果。",
        }),
      ],
    });
    bridgeMocks.generateSessionMemory.mockResolvedValue({
      ok: true,
      item: makeMemory(),
    });
  });

  it("shows only session memories in the right panel", async () => {
    render(<SessionsClient language="zh" />);

    await waitFor(() => {
      expect(bridgeMocks.getSessionMemories).toHaveBeenCalledWith("session-1");
    });

    expect(screen.getByText("【记忆优化】 · 20轮时间线记忆")).toBeTruthy();
    expect(screen.queryByText("关联文件")).toBeNull();
    expect(screen.queryByText(/linked files/i)).toBeNull();
  });

  it("supports manual generate and regenerate", async () => {
    render(<SessionsClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(bridgeMocks.getSessionMemories).toHaveBeenCalledWith("session-1");
    });

    await user.click(screen.getByRole("button", { name: "保存记忆" }));
    await user.click(screen.getByRole("button", { name: "重新整理" }));

    await waitFor(() => {
      expect(bridgeMocks.generateSessionMemory).toHaveBeenNthCalledWith(1, "session-1", { force: false });
      expect(bridgeMocks.generateSessionMemory).toHaveBeenNthCalledWith(2, "session-1", { force: true });
    });

    expect(screen.getByText("已重新整理并更新记忆。")).toBeTruthy();
  });

  it("shows a clear hint when manual memory generation returns no item", async () => {
    bridgeMocks.generateSessionMemory.mockResolvedValue({
      ok: false,
      item: null,
    });

    render(<SessionsClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(bridgeMocks.getSessionMemories).toHaveBeenCalledWith("session-1");
    });

    await user.click(screen.getByRole("button", { name: "保存记忆" }));

    await waitFor(() => {
      expect(screen.getByText(/当前 session 暂时无法生成记忆/)).toBeTruthy();
    });
  });

  it("switches sessions without reloading the whole page data", async () => {
    bridgeMocks.listSessions.mockResolvedValue({
      items: [
        makeSession({ id: "session-1", title: "【记忆优化】" }),
        makeSession({ id: "session-2", title: "【性能优化】", turnCount: 6 }),
      ],
      activeWorkspaceId: "workspace-1",
      preferredSessionId: "session-1",
    });
    bridgeMocks.getSession.mockImplementation(async (sessionId: string) => ({
      item: makeSession({
        id: sessionId,
        title: sessionId === "session-2" ? "【性能优化】" : "【记忆优化】",
        turnCount: sessionId === "session-2" ? 6 : 20,
        messages: [],
      }),
      source: "fresh",
    }));

    render(<SessionsClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /【记忆优化】/ })).toBeTruthy();
    });

    expect(bridgeMocks.listWorkspaces).toHaveBeenCalledTimes(1);
    expect(bridgeMocks.listSessions).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /【性能优化】/ }));

    await waitFor(() => {
      expect(bridgeMocks.getSession).toHaveBeenCalledWith("session-2");
    });
    expect(bridgeMocks.listWorkspaces).toHaveBeenCalledTimes(1);
    expect(bridgeMocks.listSessions).toHaveBeenCalledTimes(1);
  });
});

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "workspace-1",
    name: "web-cli",
    localPath: "/tmp/workspace",
    isActive: true,
    createdAt: "2026-04-03T00:00:00.000Z",
    updatedAt: "2026-04-03T00:00:00.000Z",
    ...overrides,
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    workspaceId: "workspace-1",
    title: "【记忆优化】",
    turnCount: 20,
    messages: [],
    createdAt: "2026-04-03T00:00:00.000Z",
    updatedAt: "2026-04-03T00:00:00.000Z",
    ...overrides,
  };
}

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
