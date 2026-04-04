import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AutomationRule, GoalAutomationRunRecord } from "@relay/shared-types";
import type { CodexAutomation } from "@/lib/codex-automations";

const apiMocks = vi.hoisted(() => ({
  createCodexAutomation: vi.fn(),
  deleteCodexAutomation: vi.fn(),
  listCodexAutomations: vi.fn(),
  listCodexAutomationRuns: vi.fn(),
  runCodexAutomationNow: vi.fn(),
  updateCodexAutomation: vi.fn(),
}));
const bridgeMocks = vi.hoisted(() => ({
  createGoalAutomationRule: vi.fn(),
  deleteAutomationRule: vi.fn(),
  listAutomations: vi.fn(),
  listGoalAutomationRuns: vi.fn(),
  listSessions: vi.fn(),
  listWorkspaces: vi.fn(),
  startAutomationRule: vi.fn(),
  stopAutomationRule: vi.fn(),
  updateGoalAutomationRule: vi.fn(),
}));

vi.mock("@/lib/api/codex-automations", () => apiMocks);
vi.mock("@/lib/api/bridge", () => bridgeMocks);
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

import { AutomationPageClient } from "@/components/automation-page-client";

describe("AutomationPageClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.listCodexAutomations.mockResolvedValue({
      items: [
        makeAutomation({
          id: "automation-1",
          name: "Codex News",
          rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU;BYHOUR=6;BYMINUTE=0",
        }),
      ],
    });
    apiMocks.createCodexAutomation.mockResolvedValue({ item: makeAutomation() });
    apiMocks.updateCodexAutomation.mockResolvedValue({ item: makeAutomation() });
    apiMocks.deleteCodexAutomation.mockResolvedValue({ ok: true });
    apiMocks.listCodexAutomationRuns.mockResolvedValue({ item: null, items: [] });
    apiMocks.runCodexAutomationNow.mockResolvedValue({ ok: true, output: "done", summary: "run completed", nextRunAt: Date.now() });
    bridgeMocks.createGoalAutomationRule.mockResolvedValue({ item: makeGoalAutomation() });
    bridgeMocks.deleteAutomationRule.mockResolvedValue({ ok: true });
    bridgeMocks.listAutomations.mockResolvedValue({
      items: [makeInternalAutomation()],
    });
    bridgeMocks.listGoalAutomationRuns.mockResolvedValue({ items: [] });
    bridgeMocks.listSessions.mockResolvedValue({
      items: [
        {
          id: "session-1",
          workspaceId: "workspace-1",
          title: "Current Session",
          turnCount: 12,
          messages: [],
          createdAt: "2026-04-04T00:00:00.000Z",
          updatedAt: "2026-04-04T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: "workspace-1",
    });
    bridgeMocks.listWorkspaces.mockResolvedValue({
      items: [
        {
          id: "workspace-1",
          name: "web-cli",
          localPath: "/Users/ruska/project/web-cli",
          isActive: true,
          createdAt: "2026-04-04T00:00:00.000Z",
          updatedAt: "2026-04-04T00:00:00.000Z",
        },
      ],
    });
  });

  it("renders codex automations and internal rules together", async () => {
    render(<AutomationPageClient language="zh" />);

    await waitFor(() => {
      expect(apiMocks.listCodexAutomations).toHaveBeenCalledTimes(1);
      expect(bridgeMocks.listAutomations).toHaveBeenCalledTimes(1);
      expect(bridgeMocks.listSessions).toHaveBeenCalledTimes(1);
      expect(bridgeMocks.listWorkspaces).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText("2 / 2 项自动化")).toBeTruthy();
    expect(screen.getAllByText("Codex News").length).toBeGreaterThan(0);
    expect(screen.getByText("按轮次自动整理")).toBeTruthy();
    expect(screen.getAllByText("每周 一、二、三、四、五、六、日 06:00 运行").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Codex 自动化").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Relay 内部规则").length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue("/Users/ruska/project/web-cli").length).toBeGreaterThan(0);
  });

  it("creates a new automation from the form", async () => {
    render(<AutomationPageClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(apiMocks.listCodexAutomations).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "新建 Codex 规则" }));
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "规则名称" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "创建" })).toBeTruthy();
    });

    await user.clear(screen.getByRole("textbox", { name: "规则名称" }));
    await user.type(screen.getByRole("textbox", { name: "规则名称" }), "Morning Codex");
    await user.click(screen.getByRole("button", { name: "创建" }));

    await waitFor(() => {
      expect(apiMocks.createCodexAutomation).toHaveBeenCalledTimes(1);
    });
  });

  it("runs a codex automation immediately", async () => {
    render(<AutomationPageClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "立即运行" })).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "立即运行" }));

    await waitFor(() => {
      expect(apiMocks.runCodexAutomationNow).toHaveBeenCalledWith("automation-1");
    });
  });

  it("creates a goal automation bound to an existing session", async () => {
    render(<AutomationPageClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(bridgeMocks.listSessions).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "新建目标规则" }));
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "目标描述" })).toBeTruthy();
    });

    await user.type(screen.getByRole("textbox", { name: "规则名称" }), "自动推进当前会话");
    await user.type(screen.getByRole("textbox", { name: "目标描述" }), "继续完成当前 session 中的目标");
    await user.selectOptions(screen.getByRole("combobox", { name: "目标会话" }), "existing-session");
    await user.click(screen.getByRole("button", { name: "创建" }));

    await waitFor(() => {
      expect(bridgeMocks.createGoalAutomationRule).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "自动推进当前会话",
          goal: "继续完成当前 session 中的目标",
          targetSessionMode: "existing-session",
          targetSessionId: "session-1",
        }),
      );
    });
  });

  it("shows run history and can open full output in a dialog", async () => {
    apiMocks.listCodexAutomationRuns.mockResolvedValue({
      item: makeRun(),
      items: [
        makeRun(),
        makeRun({
          threadId: "thread-2",
          summary: "another run summary",
          output: "another full automation output",
          createdAt: Date.now() - 60_000,
          updatedAt: Date.now() - 60_000,
        }),
      ],
    });

    render(<AutomationPageClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "立即运行" })).toBeTruthy();
    });

    await waitFor(() => {
      expect(apiMocks.listCodexAutomationRuns).toHaveBeenCalledWith("automation-1", 10);
    });

    expect(screen.getByText("latest run summary")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /latest run summary/i }));
    expect(screen.getByText("full automation output")).toBeTruthy();
  });

  it("lets the user edit the selected codex rule name from the right form", async () => {
    render(<AutomationPageClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "保存修改" })).toBeTruthy();
    });

    await user.clear(screen.getByRole("textbox", { name: "规则名称" }));
    await user.type(screen.getByRole("textbox", { name: "规则名称" }), "Codex News Daily Updated");
    await user.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() => {
      expect(apiMocks.updateCodexAutomation).toHaveBeenCalledWith(
        "automation-1",
        expect.objectContaining({ name: "Codex News Daily Updated" }),
      );
    });
  });
});

function makeAutomation(overrides: Partial<CodexAutomation> = {}): CodexAutomation {
  return {
    id: "automation-1",
    name: "Codex News",
    prompt: "Check yesterday Codex news",
    status: "ACTIVE",
    rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU;BYHOUR=6;BYMINUTE=0",
    cwds: ["/Users/ruska/project/web-cli"],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastRunAt: null,
    nextRunAt: Date.now() + 60_000,
    model: null,
    reasoningEffort: null,
    ...overrides,
  };
}

function makeInternalAutomation(
  overrides: Partial<Extract<AutomationRule, { kind: "timeline-memory-checkpoint" }>> = {},
): Extract<AutomationRule, { kind: "timeline-memory-checkpoint" }> {
  return {
    id: "timeline-memory-turn-checkpoint",
    kind: "timeline-memory-checkpoint",
    source: "relay",
    title: "按轮次自动整理",
    summary: "每 20 轮对话自动生成 timeline memory。",
    status: "active",
    workspaceId: "workspace-1",
    sessionId: "session-1",
    sessionTitle: "current session",
    createdAt: "2026-04-04T04:40:00.000Z",
    updatedAt: "2026-04-04T04:40:00.000Z",
    intervalTurns: 20,
    currentTurnCount: 12,
    turnsUntilNextRun: 8,
    nextCheckpointTurnCount: 20,
    lastRunAt: "2026-04-04T04:40:00.000Z",
    capabilities: {
      canEdit: false,
      canDelete: false,
      canRun: false,
      canStop: false,
    },
    ...overrides,
  };
}

function makeGoalAutomation(
  overrides: Partial<Extract<AutomationRule, { kind: "goal-loop" }>> = {},
): Extract<AutomationRule, { kind: "goal-loop" }> {
  return {
    id: "goal-automation-1",
    kind: "goal-loop",
    source: "relay",
    title: "自动推进当前会话",
    summary: "继续推进当前目标",
    status: "active",
    workspaceId: "workspace-1",
    sessionId: "session-1",
    sessionTitle: "Current Session",
    createdAt: "2026-04-04T04:40:00.000Z",
    updatedAt: "2026-04-04T04:40:00.000Z",
    lastRunAt: null,
    capabilities: {
      canEdit: true,
      canDelete: true,
      canRun: true,
      canStop: false,
    },
    goal: "继续推进当前 session 中的目标",
    trigger: "manual",
    targetSessionMode: "existing-session",
    maxTurns: 10,
    maxDurationMinutes: 120,
    runStatus: "idle",
    currentTurnCount: 0,
    stopReason: null,
    lastEvaluationReason: null,
    lastAssistantSummary: null,
    lastError: null,
    latestRunId: null,
    ...overrides,
  };
}

function makeRun(overrides: Partial<import("@/lib/codex-automations").CodexAutomationRun> = {}) {
  return {
    automationId: "automation-1",
    threadId: "thread-1",
    status: "completed",
    title: "Codex News",
    summary: "latest run summary",
    output: "full automation output",
    prompt: "Check Codex news",
    sourceCwd: "/Users/ruska/project/web-cli",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeGoalRun(overrides: Partial<GoalAutomationRunRecord> = {}): GoalAutomationRunRecord {
  return {
    id: "goal-run-1",
    ruleId: "goal-automation-1",
    status: "completed",
    stopReason: "completed",
    startedAt: "2026-04-04T04:40:00.000Z",
    updatedAt: "2026-04-04T04:41:00.000Z",
    finishedAt: "2026-04-04T04:41:00.000Z",
    summary: "目标已完成",
    output: "goal run output",
    turnsCompleted: 2,
    sessionId: "session-1",
    sessionTitle: "Current Session",
    lastEvaluationReason: "目标已完成",
    lastAssistantSummary: "done",
    lastError: null,
    steps: [],
    ...overrides,
  };
}
