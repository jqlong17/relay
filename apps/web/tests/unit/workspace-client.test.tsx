import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Message, Session, TimelineMemory, Workspace } from "@relay/shared-types";

const bridgeMocks = vi.hoisted(() => ({
  archiveSession: vi.fn(),
  createSession: vi.fn(),
    getFilePreview: vi.fn(),
    getFileTree: vi.fn(),
    getSession: vi.fn(),
    getSessionMemories: vi.fn(),
    listMemories: vi.fn(),
    listSessions: vi.fn(),
    listWorkspaces: vi.fn(),
  openInFinder: vi.fn(),
  openWorkspace: vi.fn(),
  openWorkspacePicker: vi.fn(),
  removeWorkspace: vi.fn(),
  renameSession: vi.fn(),
  runSessionStream: vi.fn(),
  selectSession: vi.fn(),
  subscribeRuntimeEvents: vi.fn(),
  uploadSessionImage: vi.fn(),
}));

vi.mock("@/lib/api/bridge", () => bridgeMocks);

import { WorkspaceClient } from "@/components/workspace-client";

describe("WorkspaceClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    bridgeMocks.subscribeRuntimeEvents.mockReturnValue(() => {});

    bridgeMocks.listWorkspaces.mockResolvedValue({
      items: [makeWorkspace({ id: "workspace-1", isActive: true })],
      active: makeWorkspace({ id: "workspace-1", isActive: true }),
    });
    bridgeMocks.listSessions.mockResolvedValue({
      items: [makeSessionSummary({ id: "session-1", workspaceId: "workspace-1", title: "【记忆优化】" })],
      activeWorkspaceId: "workspace-1",
      preferredSessionId: "session-1",
    });
    bridgeMocks.getFileTree.mockResolvedValue({
      item: {
        id: "root",
        name: "root",
        path: "/tmp/workspace",
        kind: "folder",
        children: [],
      },
      workspaceId: "workspace-1",
    });
    bridgeMocks.getFilePreview.mockResolvedValue({
      item: {
        path: "/tmp/workspace/README.md",
        name: "README.md",
        content: "# README\n\npreview content",
        extension: ".md",
      },
    });
    bridgeMocks.getSession.mockResolvedValue({
      item: makeSessionDetail({
        id: "session-1",
        workspaceId: "workspace-1",
        title: "【记忆优化】",
        messages: [
          makeMessage({ id: "m1", sessionId: "session-1", role: "user", content: "请整理记忆系统" }),
          makeMessage({ id: "m2", sessionId: "session-1", role: "assistant", content: "已开始整理" }),
        ],
      }),
      source: "fresh",
    });
    bridgeMocks.getSessionMemories.mockResolvedValue({
      items: [
        makeMemory({
          id: "memory-1",
          sessionId: "session-1",
          themeTitle: "【记忆优化】",
          themeKey: "记忆优化",
          checkpointTurnCount: 20,
          title: "【记忆优化】 · 20轮时间线记忆",
          content: "保留了 `services/local-bridge/src/routes/runtime.ts` 的触发逻辑。",
        }),
      ],
    });
    bridgeMocks.listMemories.mockResolvedValue({
      items: [
        makeMemory({
          id: "memory-1",
          title: "【记忆优化】 · 20轮时间线记忆",
          content: "保留了 `services/local-bridge/src/routes/runtime.ts` 的触发逻辑。",
        }),
      ],
    });
    bridgeMocks.runSessionStream.mockResolvedValue(undefined);
    HTMLElement.prototype.scrollIntoView = vi.fn();
    HTMLDivElement.prototype.scrollTo = vi.fn();
  });

  it("renders timeline memories in summary and hides linked files and timeline sections", async () => {
    render(<WorkspaceClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(bridgeMocks.getSessionMemories).toHaveBeenCalledWith("session-1");
    });
    await openWorkspaceSidepanel(user);

    expect(screen.getByText("已同步到最新")).toBeTruthy();
    expect(screen.getByText("记忆整理")).toBeTruthy();
    expect(screen.getByText("【记忆优化】 · 20轮时间线记忆")).toBeTruthy();
    expect(screen.getByText(/保留了/)).toBeTruthy();
    expect(screen.queryByText("关联文件")).toBeNull();
    expect(screen.queryByText("时间线")).toBeNull();
  });

  it("shows a single unified timeline memory action", async () => {
    render(<WorkspaceClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(bridgeMocks.getSessionMemories).toHaveBeenCalledWith("session-1");
    });
    await openWorkspaceSidepanel(user);

    await user.click(screen.getByRole("tab", { name: "动作" }));

    expect(screen.getByText("时间线记忆")).toBeTruthy();
    expect(screen.queryByText("时间线摘要")).toBeNull();
    expect(screen.queryByText("用户决策")).toBeNull();
    expect(screen.queryByText("关注点地图")).toBeNull();
  });

  it("keeps the actions panel open after clicking timeline memory action", async () => {
    render(<WorkspaceClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(bridgeMocks.getSessionMemories).toHaveBeenCalledWith("session-1");
    });
    await openWorkspaceSidepanel(user);

    await user.click(screen.getByRole("tab", { name: "动作" }));
    await user.click(screen.getByRole("button", { name: /时间线记忆/ }));

    expect(screen.getByRole("tab", { name: "动作", selected: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: /时间线记忆/ })).toBeTruthy();
  });

  it("shows a user preference memory action and fills the composer with recent-turn preference prompt", async () => {
    render(<WorkspaceClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(bridgeMocks.getSessionMemories).toHaveBeenCalledWith("session-1");
    });
    await openWorkspaceSidepanel(user);

    await user.click(screen.getByRole("tab", { name: "动作" }));
    await user.click(screen.getByRole("button", { name: /记录用户偏好/ }));

    const input = screen.getByPlaceholderText("继续在当前工作区中执行任务...") as HTMLInputElement;
    expect(input.value).toContain("请将最近 3 轮对话处理为一条“用户偏好记忆”");
    expect(input.value).toContain("当前所处的场景或环境信息");
    expect(input.value).toContain("最近 3 轮对话参考");
    expect(input.value).toContain("1. 用户: 请整理记忆系统");
    expect(input.value).toContain("2. 助手: 已开始整理");
  });

  it("shows automation as a sidepanel tab and fills the composer", async () => {
    render(<WorkspaceClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(bridgeMocks.getSessionMemories).toHaveBeenCalledWith("session-1");
    });
    await openWorkspaceSidepanel(user);

    await user.click(screen.getByRole("tab", { name: "自动化" }));
    await user.click(screen.getByRole("button", { name: /自动化/ }));

    const input = screen.getByPlaceholderText("继续在当前工作区中执行任务...") as HTMLTextAreaElement;
    expect(input.value).toContain("请基于当前上下文帮我设计一个 Codex 自动化。");
    expect(input.value).toContain("1. 这个自动化应该做什么");
  });

  it("subscribes to realtime events and refreshes session detail when thread updates", async () => {
    let eventHandler: ((event: { type: string; sessionId?: string; createdAt: string }) => void) | null = null;
    const unsubscribe = vi.fn();
    bridgeMocks.subscribeRuntimeEvents.mockImplementation(
      (
        _options: { sessionId?: string; workspaceId?: string },
        onEvent: (event: { type: string; sessionId?: string; createdAt: string }) => void,
      ) => {
        eventHandler = onEvent;
        return unsubscribe;
      },
    );
    bridgeMocks.getSession
      .mockResolvedValueOnce({
        item: makeSessionDetail({
          id: "session-1",
          workspaceId: "workspace-1",
          title: "【记忆优化】",
          messages: [makeMessage({ id: "m1", content: "初始快照" })],
        }),
        source: "fresh",
      })
      .mockResolvedValue({
        item: makeSessionDetail({
          id: "session-1",
          workspaceId: "workspace-1",
          title: "【记忆优化】",
          messages: [makeMessage({ id: "m2", content: "实时刷新内容" })],
        }),
        source: "fresh",
      });

    const { unmount } = render(<WorkspaceClient language="zh" />);

    await waitFor(() => {
      expect(bridgeMocks.subscribeRuntimeEvents).toHaveBeenCalledWith(
        { sessionId: "session-1" },
        expect.any(Function),
        expect.any(Function),
      );
    });

    if (!eventHandler) {
      throw new Error("missing realtime handler");
    }

    const publishRealtimeEvent = eventHandler as (event: { type: string; sessionId?: string; createdAt: string }) => void;
    publishRealtimeEvent({
      type: "thread.updated",
      sessionId: "session-1",
      createdAt: "2026-04-03T00:00:10.000Z",
    });

    await waitFor(() => {
      expect(bridgeMocks.getSession).toHaveBeenCalledWith("session-1", { fresh: true });
    });
    await waitFor(() => {
      expect(screen.getByText("实时刷新内容")).toBeTruthy();
    });

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("loads folder children on demand when expanding a file tree folder", async () => {
    bridgeMocks.getFileTree
      .mockResolvedValueOnce({
        item: {
          id: "root",
          name: "root",
          path: "/tmp/workspace",
          kind: "folder",
          hasChildren: true,
          children: [
            {
              id: "workflow",
              name: "workflow",
              path: "/tmp/workspace/workflow",
              kind: "folder",
              hasChildren: true,
              children: [
                {
                  id: "plan",
                  name: "执行计划",
                  path: "/tmp/workspace/workflow/执行计划",
                  kind: "folder",
                  hasChildren: true,
                },
              ],
            },
          ],
        },
        workspaceId: "workspace-1",
      })
      .mockResolvedValueOnce({
        item: {
          id: "plan",
          name: "执行计划",
          path: "/tmp/workspace/workflow/执行计划",
          kind: "folder",
          hasChildren: true,
          children: [
            {
              id: "plan-file-1",
              name: "05-Relay-v0.1.0-统一实时会话架构TDD执行计划.md",
              path: "/tmp/workspace/workflow/执行计划/05-Relay-v0.1.0-统一实时会话架构TDD执行计划.md",
              kind: "file",
            },
          ],
        },
        workspaceId: "workspace-1",
      });

    render(<WorkspaceClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(bridgeMocks.getSessionMemories).toHaveBeenCalledWith("session-1");
    });
    await openWorkspaceSidepanel(user);

    await user.click(screen.getByRole("tab", { name: "文件" }));
    await user.click(screen.getByRole("button", { name: /workflow/i }));
    await user.click(screen.getByRole("button", { name: /执行计划/i }));

    await waitFor(() => {
      expect(bridgeMocks.getFileTree).toHaveBeenLastCalledWith({
        path: "/tmp/workspace/workflow/执行计划",
        depth: 2,
      });
    });

    expect(
      screen.getByText("05-Relay-v0.1.0-统一实时会话架构TDD执行计划.md"),
    ).toBeTruthy();
  });

  it("fetches folder children when a folder is marked hasChildren but currently has an empty children list", async () => {
    bridgeMocks.getFileTree
      .mockResolvedValueOnce({
        item: {
          id: "root",
          name: "root",
          path: "/tmp/workspace",
          kind: "folder",
          hasChildren: true,
          children: [
            {
              id: "workflow",
              name: "workflow",
              path: "/tmp/workspace/workflow",
              kind: "folder",
              hasChildren: true,
              children: [
                {
                  id: "plan",
                  name: "执行计划",
                  path: "/tmp/workspace/workflow/执行计划",
                  kind: "folder",
                  hasChildren: true,
                  children: [],
                },
              ],
            },
          ],
        },
        workspaceId: "workspace-1",
      })
      .mockResolvedValueOnce({
        item: {
          id: "plan",
          name: "执行计划",
          path: "/tmp/workspace/workflow/执行计划",
          kind: "folder",
          hasChildren: true,
          children: [
            {
              id: "plan-file-2",
              name: "计划说明.md",
              path: "/tmp/workspace/workflow/执行计划/计划说明.md",
              kind: "file",
            },
          ],
        },
        workspaceId: "workspace-1",
      });

    render(<WorkspaceClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "展开" })).toBeTruthy();
    });
    await openWorkspaceSidepanel(user);

    await user.click(screen.getByRole("tab", { name: "文件" }));
    await user.click(screen.getByRole("button", { name: /workflow/i }));
    await user.click(screen.getByRole("button", { name: /执行计划/i }));

    await waitFor(() => {
      expect(bridgeMocks.getFileTree).toHaveBeenLastCalledWith({
        path: "/tmp/workspace/workflow/执行计划",
        depth: 2,
      });
    });

    expect(screen.getByText("计划说明.md")).toBeTruthy();
  });

  it("locates and highlights the earliest message when clicking the earliest shortcut", async () => {
    render(<WorkspaceClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("请整理记忆系统")).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "最早一条" }));

    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    const firstMessage = screen.getByText("请整理记忆系统").closest("article");
    expect(firstMessage?.className).toContain("workspace-log-item-highlighted");
  });

  it("jumps to the latest message by scrolling the timeline container to bottom", async () => {
    render(<WorkspaceClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("已开始整理")).toBeTruthy();
    });

    const scrollToMock = vi.mocked(HTMLDivElement.prototype.scrollTo);
    scrollToMock.mockClear();

    await user.click(screen.getByRole("button", { name: "最新一条" }));

    await waitFor(() => {
      expect(scrollToMock).toHaveBeenCalledWith(
        expect.objectContaining({
          behavior: "smooth",
        }),
      );
    });
  });

  it("shows mention suggestions and adds selected context chips", async () => {
    render(<WorkspaceClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(bridgeMocks.getSessionMemories).toHaveBeenCalledWith("session-1");
    });

    const input = screen.getByPlaceholderText("继续在当前工作区中执行任务...");
    await user.type(input, "@记");

    await waitFor(() => {
      expect(bridgeMocks.listMemories).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByRole("listbox", { name: "context suggestions" })).toBeTruthy();
    await user.click(screen.getByRole("option", { name: /【记忆优化】 · 20轮时间线记忆/ }));

    const selectedContext = screen.getByRole("list", { name: "selected context" });
    expect(selectedContext).toBeTruthy();
    expect(selectedContext.textContent).toContain("【记忆优化】 · 20轮时间线记忆");
  });

  it("materializes referenced memory content before sending to runtime", async () => {
    render(<WorkspaceClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(bridgeMocks.getSessionMemories).toHaveBeenCalledWith("session-1");
    });

    const input = screen.getByPlaceholderText("继续在当前工作区中执行任务...");
    await user.type(input, "@记");
    await user.click(await screen.findByRole("option", { name: /【记忆优化】 · 20轮时间线记忆/ }));
    await user.type(input, "继续优化这个方案");
    await user.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(bridgeMocks.runSessionStream).toHaveBeenCalledWith(
        "session-1",
        expect.stringContaining("保留了 `services/local-bridge/src/routes/runtime.ts` 的触发逻辑。"),
        [],
        expect.any(Function),
      );
    });
    expect(bridgeMocks.runSessionStream).toHaveBeenCalledWith(
      "session-1",
      expect.stringContaining("当前用户请求\n继续优化这个方案"),
      [],
      expect.any(Function),
    );
  });

  it("uploads pasted clipboard screenshots from the composer", async () => {
    bridgeMocks.uploadSessionImage.mockResolvedValue({
      item: {
        path: "/tmp/pasted-image.png",
        name: "pasted-image.png",
        mimeType: "image/png",
      },
    });

    render(<WorkspaceClient language="zh" />);

    await waitFor(() => {
      expect(bridgeMocks.getSessionMemories).toHaveBeenCalledWith("session-1");
    });

    const input = screen.getByPlaceholderText("继续在当前工作区中执行任务...");
    const file = new File(["image"], "Screenshot 2026-04-03.png", { type: "image/png" });
    const preventDefault = vi.fn();

    fireEvent.paste(input, {
      clipboardData: {
        files: [file],
        items: [],
      },
      preventDefault,
    });

    await waitFor(() => {
      expect(bridgeMocks.uploadSessionImage).toHaveBeenCalledWith("session-1", file);
      expect(screen.getByRole("list", { name: "pasted images" }).textContent).toContain("图1");
    });
  });

  it("shows streamed process updates in the timeline", async () => {
    bridgeMocks.getSession.mockResolvedValue({
      item: makeSessionDetail({
        id: "session-1",
        workspaceId: "workspace-1",
        title: "【记忆优化】",
        messages: [
          makeMessage({ id: "m1", sessionId: "session-1", role: "user", content: "请整理记忆系统" }),
          makeMessage({ id: "m2", sessionId: "session-1", role: "assistant", content: "已开始整理" }),
          makeMessage({
            id: "m-process",
            sessionId: "session-1",
            role: "system",
            content: "**Thinking**\nInspecting paste support.\n\n**Command**\n$ rg -n paste .\napps/web/src/components/workspace-client.tsx:1001\n",
          }),
          makeMessage({ id: "m3", sessionId: "session-1", role: "user", content: "检查过程显示" }),
          makeMessage({ id: "m4", sessionId: "session-1", role: "assistant", content: "Done." }),
        ],
      }),
      source: "fresh",
    });

    bridgeMocks.runSessionStream.mockImplementation(
      async (
        _sessionId: string,
        _content: string,
        _attachments: unknown[],
        onEvent: (event: Record<string, string>) => void,
      ) => {
        onEvent({
          type: "run.started",
          runId: "run-1",
          sessionId: "session-1",
          createdAt: "2026-04-03T00:00:00.000Z",
        });
        onEvent({
          type: "process.delta",
          runId: "run-1",
          phase: "thinking",
          delta: "Inspecting paste support.",
          createdAt: "2026-04-03T00:00:01.000Z",
        });
        onEvent({
          type: "process.delta",
          runId: "run-1",
          phase: "command",
          delta: "$ rg -n paste .\napps/web/src/components/workspace-client.tsx:1001\n",
          createdAt: "2026-04-03T00:00:02.000Z",
        });
        onEvent({
          type: "message.delta",
          runId: "run-1",
          messageId: "assistant-1",
          delta: "Done.",
          createdAt: "2026-04-03T00:00:03.000Z",
        });
        onEvent({
          type: "message.completed",
          runId: "run-1",
          messageId: "assistant-1",
          createdAt: "2026-04-03T00:00:04.000Z",
        });
        onEvent({
          type: "run.completed",
          runId: "run-1",
          sessionId: "session-1",
          createdAt: "2026-04-03T00:00:05.000Z",
        });
      },
    );

    render(<WorkspaceClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("继续在当前工作区中执行任务...")).toBeTruthy();
    });

    await user.type(screen.getByPlaceholderText("继续在当前工作区中执行任务..."), "检查过程显示");
    await user.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(screen.getByText("Thinking")).toBeTruthy();
      expect(screen.getByText(/Inspecting paste support/)).toBeTruthy();
      expect(screen.getByText("Command")).toBeTruthy();
      expect(screen.getByText(/\$ rg -n paste \./)).toBeTruthy();
      expect(screen.getByText("Done.")).toBeTruthy();
    });
  });

  it("materializes referenced session context before sending to runtime", async () => {
    bridgeMocks.listSessions.mockResolvedValue({
      items: [
        makeSessionSummary({ id: "session-1", workspaceId: "workspace-1", title: "【记忆优化】" }),
        makeSessionSummary({ id: "session-2", workspaceId: "workspace-1", title: "【性能优化】", turnCount: 6 }),
      ],
      activeWorkspaceId: "workspace-1",
      preferredSessionId: "session-1",
    });
    bridgeMocks.getSession.mockImplementation(async (sessionId: string) => {
      if (sessionId === "session-2") {
        return {
          item: makeSessionDetail({
            id: "session-2",
            workspaceId: "workspace-1",
            title: "【性能优化】",
            turnCount: 6,
            messages: [
              makeMessage({ id: "s2-1", sessionId: "session-2", role: "user", content: "帮我看性能瓶颈" }),
              makeMessage({ id: "s2-2", sessionId: "session-2", role: "assistant", content: "重点在渲染和缓存" }),
            ],
          }),
          source: "fresh",
        };
      }

      return {
        item: makeSessionDetail({
          id: "session-1",
          workspaceId: "workspace-1",
          title: "【记忆优化】",
          messages: [
            makeMessage({ id: "m1", sessionId: "session-1", role: "user", content: "请整理记忆系统" }),
            makeMessage({ id: "m2", sessionId: "session-1", role: "assistant", content: "已开始整理" }),
          ],
        }),
        source: "fresh",
      };
    });

    render(<WorkspaceClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("继续在当前工作区中执行任务...")).toBeTruthy();
    });

    const input = screen.getByPlaceholderText("继续在当前工作区中执行任务...");
    await user.type(input, "@性");
    await user.click(await screen.findByRole("option", { name: /【性能优化】/ }));
    await user.type(input, "结合它继续设计");
    await user.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(bridgeMocks.getSession).toHaveBeenCalledWith("session-2");
    });
    expect(bridgeMocks.runSessionStream).toHaveBeenCalledWith(
      "session-1",
      expect.stringContaining("1. user: 帮我看性能瓶颈"),
      [],
      expect.any(Function),
    );
  });

  it("does not reopen the active workspace when creating a new session", async () => {
    bridgeMocks.createSession.mockResolvedValue({
      item: makeSessionSummary({ id: "session-2", workspaceId: "workspace-1", title: "Session 10:00:00" }),
    });
    bridgeMocks.listSessions
      .mockResolvedValueOnce({
        items: [makeSessionSummary({ id: "session-1", workspaceId: "workspace-1", title: "【记忆优化】" })],
        activeWorkspaceId: "workspace-1",
        preferredSessionId: "session-1",
      })
      .mockResolvedValueOnce({
        items: [
          makeSessionSummary({ id: "session-1", workspaceId: "workspace-1", title: "【记忆优化】" }),
          makeSessionSummary({ id: "session-2", workspaceId: "workspace-1", title: "Session 10:00:00" }),
        ],
        activeWorkspaceId: "workspace-1",
        preferredSessionId: "session-2",
      });
    bridgeMocks.getSession
      .mockResolvedValueOnce({
        item: makeSessionDetail({
          id: "session-1",
          workspaceId: "workspace-1",
          title: "【记忆优化】",
          messages: [
            makeMessage({ id: "m1", sessionId: "session-1", role: "user", content: "请整理记忆系统" }),
            makeMessage({ id: "m2", sessionId: "session-1", role: "assistant", content: "已开始整理" }),
          ],
        }),
        source: "fresh",
      })
      .mockResolvedValueOnce({
        item: makeSessionDetail({
          id: "session-2",
          workspaceId: "workspace-1",
          title: "Session 10:00:00",
          messages: [],
        }),
        source: "fresh",
      })
      .mockResolvedValue({
        item: makeSessionDetail({
          id: "session-1",
          workspaceId: "workspace-1",
          title: "【记忆优化】",
          messages: [
            makeMessage({ id: "m1", sessionId: "session-1", role: "user", content: "请整理记忆系统" }),
            makeMessage({ id: "m2", sessionId: "session-1", role: "assistant", content: "已开始整理" }),
          ],
        }),
        source: "fresh",
      });

    render(<WorkspaceClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "新建会话 web-cli" })).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "新建会话 web-cli" }));

    await waitFor(() => {
      expect(bridgeMocks.createSession).toHaveBeenCalledTimes(1);
      expect(bridgeMocks.openWorkspace).not.toHaveBeenCalled();
      expect(bridgeMocks.getSession).toHaveBeenCalledWith("session-2");
    });
  });
});

async function openWorkspaceSidepanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "展开" }));
  await waitFor(() => {
    expect(screen.getByRole("tab", { name: "摘要" })).toBeTruthy();
  });
}

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

function makeSessionSummary(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    workspaceId: "workspace-1",
    title: "summary",
    turnCount: 1,
    messages: [],
    createdAt: "2026-04-03T00:00:00.000Z",
    updatedAt: "2026-04-03T00:00:00.000Z",
    ...overrides,
  };
}

function makeSessionDetail(overrides: Partial<Session> = {}): Session {
  return makeSessionSummary({
    messages: [],
    ...overrides,
  });
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "message-1",
    sessionId: "session-1",
    role: "assistant",
    content: "message",
    sequence: 1,
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
