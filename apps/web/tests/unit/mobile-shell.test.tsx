import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Message, Session, TimelineMemory, Workspace } from "@relay/shared-types";

const bridgeMocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  getSession: vi.fn(),
  listMemories: vi.fn(),
  listSessions: vi.fn(),
  listWorkspaces: vi.fn(),
  openWorkspace: vi.fn(),
  runSessionStream: vi.fn(),
  selectSession: vi.fn(),
  subscribeRuntimeEvents: vi.fn(),
  uploadSessionImage: vi.fn(),
}));

vi.mock("@/lib/api/bridge", () => bridgeMocks);

import { MobileShell } from "@/components/mobile/mobile-shell";

describe("MobileShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    bridgeMocks.subscribeRuntimeEvents.mockReturnValue(() => {});
    bridgeMocks.listMemories.mockResolvedValue({ items: [] });
  });

  it("renders the initial workspace and latest message snapshot", async () => {
    const { container } = render(
      <MobileShell
        initialActiveSession={makeSessionDetail({
          id: "session-1",
          title: "alpha",
          messages: [makeMessage({ role: "assistant", content: "latest reply" })],
        })}
        initialActiveWorkspace={makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })}
        initialSessions={[makeSessionSummary({ id: "session-1", title: "alpha", workspaceId: "workspace-1" })]}
        initialWorkspaces={[makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })]}
        language="en"
      />,
    );

    expect(container.querySelector(".mobile-header-meta")?.textContent).toContain("web-cli");
    expect(container.querySelector(".mobile-header-meta")?.textContent).toContain("alpha");
    expect(container.querySelector(".mobile-status-pill")?.textContent).toBe("online");
    expect(screen.getByText("latest reply")).toBeTruthy();
    await waitFor(() => {
      expect((HTMLElement.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    });
  });

  it("silently refreshes data when no initial snapshot is provided", async () => {
    bridgeMocks.listWorkspaces.mockResolvedValue({
      items: [makeWorkspace({ id: "workspace-1", name: "workspace-a", isActive: true })],
      active: makeWorkspace({ id: "workspace-1", name: "workspace-a", isActive: true }),
    });
    bridgeMocks.listSessions.mockResolvedValue({
      items: [makeSessionSummary({ id: "session-1", title: "alpha", workspaceId: "workspace-1" })],
      activeWorkspaceId: "workspace-1",
      preferredSessionId: "session-1",
    });
    bridgeMocks.getSession.mockResolvedValue({
      item: makeSessionDetail({
        id: "session-1",
        title: "alpha",
        workspaceId: "workspace-1",
        messages: [makeMessage({ role: "assistant", content: "hydrated reply" })],
      }),
    });

    const { container } = render(
      <MobileShell
        initialActiveSession={null}
        initialActiveWorkspace={null}
        initialSessions={[]}
        initialWorkspaces={[]}
        language="en"
      />,
    );

    await waitFor(() => {
      expect(bridgeMocks.listWorkspaces).toHaveBeenCalledTimes(1);
      expect(bridgeMocks.listSessions).toHaveBeenCalledTimes(1);
      expect(container.querySelector(".mobile-header-meta")?.textContent).toContain("workspace-a");
      expect(container.querySelector(".mobile-header-meta")?.textContent).toContain("alpha");
      expect(screen.getByText("hydrated reply")).toBeTruthy();
    });

    expect(screen.queryByText("loading...")).toBeNull();
  });

  it("opens the drawers from the top-right controls", async () => {
    const activeWorkspace = makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true });
    render(
      <MobileShell
        initialActiveSession={makeSessionDetail({ id: "session-1", workspaceId: "workspace-1" })}
        initialActiveWorkspace={activeWorkspace}
        initialSessions={[
          makeSessionSummary({ id: "session-1", title: "alpha", workspaceId: "workspace-1" }),
          makeSessionSummary({ id: "session-2", title: "beta", workspaceId: "workspace-1" }),
        ]}
        initialWorkspaces={[
          activeWorkspace,
          makeWorkspace({ id: "workspace-2", name: "design-notes", isActive: false }),
        ]}
        language="en"
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "workspaces" }));
    expect(screen.getByRole("button", { name: "close workspaces" })).toBeTruthy();
    expect(screen.getByText("design-notes")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "sessions" }));
    expect(screen.getByRole("button", { name: "close sessions" })).toBeTruthy();
    expect(screen.getByText("beta")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "memories" }));
    expect(screen.getByRole("button", { name: "close memories" })).toBeTruthy();
  });

  it("opens the memories tab and shows day details from the calendar", async () => {
    bridgeMocks.listMemories.mockResolvedValue({
      items: [
        makeMemory({
          id: "memory-1",
          memoryDate: "2026-04-03",
          title: "Refine mobile spacing",
          themeTitle: "mobile ui",
          content: "Tighten drawer density and align the tabs.",
        }),
      ],
    });

    render(
      <MobileShell
        initialActiveSession={makeSessionDetail({ id: "session-1", workspaceId: "workspace-1" })}
        initialActiveWorkspace={makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })}
        initialSessions={[makeSessionSummary({ id: "session-1", title: "alpha", workspaceId: "workspace-1" })]}
        initialWorkspaces={[makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })]}
        language="en"
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "memories" }));

    await waitFor(() => {
      expect(bridgeMocks.listMemories).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: "2026-04-03 (1)" })).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "2026-04-03 (1)" }));

    await waitFor(() => {
      expect(screen.getByText("daily memories")).toBeTruthy();
      expect(screen.getByText("Refine mobile spacing")).toBeTruthy();
      expect(screen.getByText(/Tighten drawer density/i)).toBeTruthy();
    });
  });

  it("selects another session from the sessions drawer", async () => {
    bridgeMocks.getSession.mockResolvedValue({
      item: makeSessionDetail({
        id: "session-2",
        title: "beta",
        workspaceId: "workspace-1",
        messages: [makeMessage({ role: "assistant", content: "session two detail" })],
      }),
    });

    render(
      <MobileShell
        initialActiveSession={makeSessionDetail({
          id: "session-1",
          title: "alpha",
          workspaceId: "workspace-1",
          messages: [makeMessage({ role: "assistant", content: "session one detail" })],
        })}
        initialActiveWorkspace={makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })}
        initialSessions={[
          makeSessionSummary({ id: "session-1", title: "alpha", workspaceId: "workspace-1" }),
          makeSessionSummary({ id: "session-2", title: "beta", workspaceId: "workspace-1" }),
        ]}
        initialWorkspaces={[makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })]}
        language="en"
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "sessions" }));
    await user.click(screen.getByRole("button", { name: /beta/i }));

    await waitFor(() => {
      expect(bridgeMocks.selectSession).toHaveBeenCalledWith("session-2");
      expect(screen.getByText("session two detail")).toBeTruthy();
    });
  });

  it("renders session drawer rows without collapsing long titles", async () => {
    render(
      <MobileShell
        initialActiveSession={makeSessionDetail({ id: "session-1", workspaceId: "workspace-1" })}
        initialActiveWorkspace={makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })}
        initialSessions={[
          makeSessionSummary({
            id: "session-1",
            title: "Session 13:29:27 with a very long title for mobile drawer verification",
            workspaceId: "workspace-1",
          }),
          makeSessionSummary({
            id: "session-2",
            title: "Another extremely long session title that should remain on a single stable row",
            workspaceId: "workspace-1",
          }),
        ]}
        initialWorkspaces={[makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })]}
        language="en"
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "sessions" }));

    const sessionButtons = screen.getAllByRole("button").filter((item) => item.className.includes("mobile-drawer-item"));
    expect(sessionButtons).toHaveLength(2);
    expect(screen.getByText(/Session 13:29:27 with a very long title/i)).toBeTruthy();
    expect(screen.getByText(/Another extremely long session title/i)).toBeTruthy();
  });

  it("switches workspace and refreshes session data", async () => {
    bridgeMocks.openWorkspace.mockResolvedValue({
      item: makeWorkspace({ id: "workspace-2", name: "docs", localPath: "/tmp/docs", isActive: true }),
    });
    bridgeMocks.listWorkspaces.mockResolvedValue({
      items: [
        makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: false }),
        makeWorkspace({ id: "workspace-2", name: "docs", localPath: "/tmp/docs", isActive: true }),
      ],
      active: makeWorkspace({ id: "workspace-2", name: "docs", localPath: "/tmp/docs", isActive: true }),
    });
    bridgeMocks.listSessions.mockResolvedValue({
      items: [makeSessionSummary({ id: "session-2", title: "docs session", workspaceId: "workspace-2" })],
      activeWorkspaceId: "workspace-2",
      preferredSessionId: "session-2",
    });
    bridgeMocks.getSession.mockResolvedValue({
      item: makeSessionDetail({
        id: "session-2",
        title: "docs session",
        workspaceId: "workspace-2",
        messages: [makeMessage({ role: "assistant", content: "docs detail" })],
      }),
    });

    const { container } = render(
      <MobileShell
        initialActiveSession={makeSessionDetail({ id: "session-1", workspaceId: "workspace-1" })}
        initialActiveWorkspace={makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })}
        initialSessions={[makeSessionSummary({ id: "session-1", title: "alpha", workspaceId: "workspace-1" })]}
        initialWorkspaces={[
          makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true }),
          makeWorkspace({ id: "workspace-2", name: "docs", localPath: "/tmp/docs", isActive: false }),
        ]}
        language="en"
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "workspaces" }));
    await user.click(screen.getByRole("button", { name: "docs" }));

    await waitFor(() => {
      expect(bridgeMocks.openWorkspace).toHaveBeenCalledWith("/tmp/docs");
      expect(screen.getByText("docs detail")).toBeTruthy();
      expect(container.querySelector(".mobile-header-meta")?.textContent).toContain("docs");
      expect(container.querySelector(".mobile-header-meta")?.textContent).toContain("docs session");
    });
  });

  it("opens a workspace by manual path from the workspace drawer advanced section", async () => {
    bridgeMocks.openWorkspace.mockResolvedValue({
      item: makeWorkspace({ id: "workspace-2", name: "docs", localPath: "/tmp/docs", isActive: true }),
    });
    bridgeMocks.listWorkspaces.mockResolvedValue({
      items: [
        makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: false }),
        makeWorkspace({ id: "workspace-2", name: "docs", localPath: "/tmp/docs", isActive: true }),
      ],
      active: makeWorkspace({ id: "workspace-2", name: "docs", localPath: "/tmp/docs", isActive: true }),
    });
    bridgeMocks.listSessions.mockResolvedValue({
      items: [makeSessionSummary({ id: "session-2", title: "docs session", workspaceId: "workspace-2" })],
      activeWorkspaceId: "workspace-2",
      preferredSessionId: "session-2",
    });
    bridgeMocks.getSession.mockResolvedValue({
      item: makeSessionDetail({
        id: "session-2",
        title: "docs session",
        workspaceId: "workspace-2",
        messages: [makeMessage({ role: "assistant", content: "docs detail" })],
      }),
    });

    const { container } = render(
      <MobileShell
        initialActiveSession={makeSessionDetail({ id: "session-1", workspaceId: "workspace-1" })}
        initialActiveWorkspace={makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })}
        initialSessions={[makeSessionSummary({ id: "session-1", title: "alpha", workspaceId: "workspace-1" })]}
        initialWorkspaces={[makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })]}
        language="en"
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "workspaces" }));
    await user.click(screen.getByText("advanced"));
    await user.type(screen.getByPlaceholderText("enter the project path on your computer"), "/tmp/docs");
    await user.click(screen.getByRole("button", { name: "open by path" }));

    await waitFor(() => {
      expect(bridgeMocks.openWorkspace).toHaveBeenCalledWith("/tmp/docs");
      expect(screen.getByText("docs detail")).toBeTruthy();
      expect(container.querySelector(".mobile-header-meta")?.textContent).toContain("docs");
      expect(container.querySelector(".mobile-header-meta")?.textContent).toContain("docs session");
    });
  });

  it("allows starring a workspace in the workspace drawer", async () => {
    render(
      <MobileShell
        initialActiveSession={makeSessionDetail({ id: "session-1", workspaceId: "workspace-1" })}
        initialActiveWorkspace={makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })}
        initialSessions={[makeSessionSummary({ id: "session-1", title: "alpha", workspaceId: "workspace-1" })]}
        initialWorkspaces={[
          makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true }),
          makeWorkspace({ id: "workspace-2", name: "docs", isActive: false }),
        ]}
        language="en"
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "workspaces" }));
    const recentSectionTitle = screen.getByText("recent workspaces");
    const recentSection = recentSectionTitle.closest("section");
    expect(recentSection).toBeTruthy();
    await user.click(within(recentSection as HTMLElement).getByRole("button", { name: "star workspace" }));

    expect(screen.getAllByText("docs").length).toBeGreaterThan(0);
    expect(screen.getByText("starred workspaces")).toBeTruthy();
  });

  it("creates a new session from the sessions drawer", async () => {
    bridgeMocks.createSession.mockResolvedValue({
      item: makeSessionSummary({ id: "session-2", title: "Session 10:00:00", workspaceId: "workspace-1" }),
    });
    bridgeMocks.listWorkspaces.mockResolvedValue({
      items: [makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })],
      active: makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true }),
    });
    bridgeMocks.listSessions.mockResolvedValue({
      items: [makeSessionSummary({ id: "session-2", title: "Session 10:00:00", workspaceId: "workspace-1" })],
      activeWorkspaceId: "workspace-1",
      preferredSessionId: "session-2",
    });
    bridgeMocks.getSession.mockResolvedValue({
      item: makeSessionDetail({
        id: "session-2",
        title: "Session 10:00:00",
        workspaceId: "workspace-1",
        messages: [makeMessage({ role: "assistant", content: "new session ready" })],
      }),
    });

    render(
      <MobileShell
        initialActiveSession={makeSessionDetail({ id: "session-1", workspaceId: "workspace-1" })}
        initialActiveWorkspace={makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })}
        initialSessions={[makeSessionSummary({ id: "session-1", title: "alpha", workspaceId: "workspace-1" })]}
        initialWorkspaces={[makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })]}
        language="en"
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "sessions" }));
    await user.click(screen.getByRole("button", { name: "new session" }));

    await waitFor(() => {
      expect(bridgeMocks.createSession).toHaveBeenCalledTimes(1);
      expect(screen.getByText("new session ready")).toBeTruthy();
    });
  });

  it("streams a successful run and refreshes the session", async () => {
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
          delta: "Reviewing mobile composer flow.",
          createdAt: "2026-04-03T00:00:00.500Z",
        });
        onEvent({
          type: "message.delta",
          runId: "run-1",
          messageId: "assistant-1",
          delta: "streamed reply",
          createdAt: "2026-04-03T00:00:01.000Z",
        });
        onEvent({
          type: "message.completed",
          runId: "run-1",
          messageId: "assistant-1",
          createdAt: "2026-04-03T00:00:02.000Z",
        });
        onEvent({
          type: "run.completed",
          runId: "run-1",
          sessionId: "session-1",
          createdAt: "2026-04-03T00:00:03.000Z",
        });
      },
    );
    bridgeMocks.getSession.mockResolvedValue({
      item: makeSessionDetail({
        id: "session-1",
        title: "alpha",
        workspaceId: "workspace-1",
        messages: [
          makeMessage({ id: "m1", role: "assistant", content: "existing" }),
          makeMessage({ id: "m2", role: "user", content: "hello" }),
          makeMessage({ id: "m-process", role: "system", content: "**Thinking**\nReviewing mobile composer flow." }),
          makeMessage({ id: "m3", role: "assistant", content: "streamed reply" }),
        ],
      }),
    });

    render(
      <MobileShell
        initialActiveSession={makeSessionDetail({
          id: "session-1",
          title: "alpha",
          workspaceId: "workspace-1",
          messages: [makeMessage({ id: "m1", role: "assistant", content: "existing" })],
        })}
        initialActiveWorkspace={makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })}
        initialSessions={[makeSessionSummary({ id: "session-1", title: "alpha", workspaceId: "workspace-1" })]}
        initialWorkspaces={[makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })]}
        language="en"
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "hello");
    await user.click(screen.getByRole("button", { name: "run" }));

    await waitFor(() => {
      expect(bridgeMocks.runSessionStream).toHaveBeenCalledWith("session-1", "hello", [], expect.any(Function));
      expect(screen.getByText("Thinking")).toBeTruthy();
      expect(screen.getByText(/Reviewing mobile composer flow/)).toBeTruthy();
      expect(screen.getByText("streamed reply")).toBeTruthy();
    });
  });

  it("submits with Enter and surfaces run errors", async () => {
    bridgeMocks.runSessionStream.mockRejectedValue(new Error("run failed"));

    render(
      <MobileShell
        initialActiveSession={makeSessionDetail({
          id: "session-1",
          title: "alpha",
          workspaceId: "workspace-1",
          messages: [makeMessage({ id: "m1", role: "assistant", content: "existing" })],
        })}
        initialActiveWorkspace={makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })}
        initialSessions={[makeSessionSummary({ id: "session-1", title: "alpha", workspaceId: "workspace-1" })]}
        initialWorkspaces={[makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })]}
        language="en"
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "hello{enter}");

    await waitFor(() => {
      expect(bridgeMocks.runSessionStream).toHaveBeenCalled();
      expect(screen.getAllByText("run failed").length).toBeGreaterThan(0);
    });
  });

  it("does not submit while IME composition is still active", async () => {
    render(
      <MobileShell
        initialActiveSession={makeSessionDetail({
          id: "session-1",
          title: "alpha",
          workspaceId: "workspace-1",
          messages: [makeMessage({ id: "m1", role: "assistant", content: "existing" })],
        })}
        initialActiveWorkspace={makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })}
        initialSessions={[makeSessionSummary({ id: "session-1", title: "alpha", workspaceId: "workspace-1" })]}
        initialWorkspaces={[makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })]}
        language="en"
      />,
    );

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "nihao" } });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });

    expect(bridgeMocks.runSessionStream).not.toHaveBeenCalled();
    expect((input as HTMLTextAreaElement).value).toBe("nihao");
  });

  it("uploads pasted clipboard screenshots from the mobile composer", async () => {
    bridgeMocks.uploadSessionImage.mockResolvedValue({
      item: {
        path: "/tmp/mobile-pasted-image.png",
        name: "mobile-pasted-image.png",
        mimeType: "image/png",
      },
    });

    render(
      <MobileShell
        initialActiveSession={makeSessionDetail({
          id: "session-1",
          title: "alpha",
          workspaceId: "workspace-1",
          messages: [makeMessage({ id: "m1", role: "assistant", content: "existing" })],
        })}
        initialActiveWorkspace={makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })}
        initialSessions={[makeSessionSummary({ id: "session-1", title: "alpha", workspaceId: "workspace-1" })]}
        initialWorkspaces={[makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })]}
        language="en"
      />,
    );

    const input = screen.getByRole("textbox");
    const file = new File(["image"], "Screenshot 2026-04-03.png", { type: "image/png" });

    fireEvent.paste(input, {
      clipboardData: {
        files: [file],
        items: [],
      },
    });

    await waitFor(() => {
      expect(bridgeMocks.uploadSessionImage).toHaveBeenCalledWith("session-1", file);
      expect(screen.getByRole("list", { name: "pasted images" }).textContent).toContain("图1");
    });
  });

  it("renders markdown content in the mobile thread", () => {
    render(
      <MobileShell
        initialActiveSession={makeSessionDetail({
          id: "session-1",
          title: "alpha",
          workspaceId: "workspace-1",
          messages: [
            makeMessage({
              id: "m1",
              role: "assistant",
              content: "# Title\n\n- one\n- two\n\n`code`",
            }),
          ],
        })}
        initialActiveWorkspace={makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })}
        initialSessions={[makeSessionSummary({ id: "session-1", title: "alpha", workspaceId: "workspace-1" })]}
        initialWorkspaces={[makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })]}
        language="en"
      />,
    );

    const message = screen.getByText("Title").closest(".mobile-message");
    expect(message).toBeTruthy();
    expect(within(message as HTMLElement).getByRole("heading", { level: 1, name: "Title" })).toBeTruthy();
    expect(within(message as HTMLElement).getByText("one")).toBeTruthy();
    expect(within(message as HTMLElement).getByText("two")).toBeTruthy();
    expect(within(message as HTMLElement).getByText("code")).toBeTruthy();
  });

  it("disables sending when there is no active session", async () => {
    render(
      <MobileShell
        initialActiveSession={null}
        initialActiveWorkspace={makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })}
        initialSessions={[]}
        initialWorkspaces={[makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })]}
        language="en"
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "hello");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("hello");
    expect(screen.getByRole("button", { name: "run" }).hasAttribute("disabled")).toBe(true);
  });

  it("restores the last mobile snapshot before background refresh completes", async () => {
    window.localStorage.setItem(
      "relay.mobile.snapshot.v1",
      JSON.stringify({
        workspaces: [makeWorkspace({ id: "workspace-9", name: "cached-workspace", isActive: true })],
        activeWorkspace: makeWorkspace({ id: "workspace-9", name: "cached-workspace", isActive: true }),
        sessions: [makeSessionSummary({ id: "session-9", title: "cached-session", workspaceId: "workspace-9" })],
        activeSession: makeSessionDetail({
          id: "session-9",
          title: "cached-session",
          workspaceId: "workspace-9",
          messages: [makeMessage({ id: "m9", content: "cached reply" })],
        }),
      }),
    );

    bridgeMocks.listWorkspaces.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ items: [], active: null }), 50)),
    );
    bridgeMocks.listSessions.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ items: [], activeWorkspaceId: null }), 50)),
    );

    const { container } = render(
      <MobileShell
        initialActiveSession={null}
        initialActiveWorkspace={null}
        initialSessions={[]}
        initialWorkspaces={[]}
        language="en"
      />,
    );

    expect(container.querySelector(".mobile-header-meta")?.textContent).toContain("cached-workspace");
    expect(container.querySelector(".mobile-header-meta")?.textContent).toContain("cached-session");
    expect(container.querySelector(".mobile-status-pill")?.textContent).toBe("restored");
    expect(screen.getByText("cached reply")).toBeTruthy();
  });

  it("shows running status while a stream is in progress", async () => {
    let releaseRun: (() => void) | null = null;
    bridgeMocks.runSessionStream.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseRun = resolve;
        }),
    );

    render(
      <MobileShell
        initialActiveSession={makeSessionDetail({
          id: "session-1",
          title: "alpha",
          workspaceId: "workspace-1",
          messages: [makeMessage({ id: "m1", role: "assistant", content: "existing" })],
        })}
        initialActiveWorkspace={makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })}
        initialSessions={[makeSessionSummary({ id: "session-1", title: "alpha", workspaceId: "workspace-1" })]}
        initialWorkspaces={[makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })]}
        language="en"
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "hello");
    await user.click(screen.getByRole("button", { name: "run" }));

    await waitFor(() => {
      expect(screen.getByText("running")).toBeTruthy();
    });

    if (!releaseRun) {
      throw new Error("run stream was not captured");
    }

    const finishRun = releaseRun as () => void;
    finishRun();
  });

  it("subscribes to realtime updates and refreshes active session on thread events", async () => {
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
    bridgeMocks.getSession.mockResolvedValue({
      item: makeSessionDetail({
        id: "session-1",
        title: "alpha",
        workspaceId: "workspace-1",
        messages: [makeMessage({ id: "m-sync", content: "synced from realtime" })],
      }),
    });

    const { unmount } = render(
      <MobileShell
        initialActiveSession={makeSessionDetail({
          id: "session-1",
          title: "alpha",
          workspaceId: "workspace-1",
          messages: [makeMessage({ id: "m1", content: "stale snapshot" })],
        })}
        initialActiveWorkspace={makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })}
        initialSessions={[makeSessionSummary({ id: "session-1", title: "alpha", workspaceId: "workspace-1" })]}
        initialWorkspaces={[makeWorkspace({ id: "workspace-1", name: "web-cli", isActive: true })]}
        language="en"
      />,
    );

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
      createdAt: "2026-04-03T00:00:09.000Z",
    });

    await waitFor(() => {
      expect(bridgeMocks.getSession).toHaveBeenCalledWith("session-1", { fresh: true });
    });
    await waitFor(() => {
      expect(screen.getByText("synced from realtime")).toBeTruthy();
    });

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "workspace-1",
    name: "workspace",
    localPath: "/tmp/workspace",
    isActive: false,
    createdAt: "2026-04-03T00:00:00.000Z",
    updatedAt: "2026-04-03T00:00:00.000Z",
    ...overrides,
  };
}

function makeSessionSummary(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    workspaceId: "workspace-1",
    title: "session",
    turnCount: 1,
    messages: [],
    createdAt: "2026-04-03T00:00:00.000Z",
    updatedAt: "2026-04-03T00:00:00.000Z",
    ...overrides,
  };
}

function makeSessionDetail(overrides: Partial<Session> = {}): Session {
  return {
    ...makeSessionSummary(),
    messages: [makeMessage()],
    ...overrides,
  };
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "message-1",
    sessionId: "session-1",
    role: "assistant",
    content: "assistant message",
    status: "completed",
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
    themeTitle: "workflow",
    themeKey: "workflow",
    sessionTitleSnapshot: "alpha",
    memoryDate: "2026-04-03",
    checkpointTurnCount: 3,
    promptVersion: "v1",
    title: "memory title",
    content: "memory content",
    status: "completed",
    sourceThreadUpdatedAt: "2026-04-03T00:00:00.000Z",
    createdAt: "2026-04-03T00:00:00.000Z",
    updatedAt: "2026-04-03T00:00:00.000Z",
    generationError: null,
    ...overrides,
  };
}
