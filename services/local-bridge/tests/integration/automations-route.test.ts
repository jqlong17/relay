import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import type { AutomationRule, GoalAutomationRunRecord } from "@relay/shared-types";

import { createBridgeServer } from "../../src";
import { CodexAppServerService, type AppServerNotification, type AppServerThread } from "../../src/services/codex-app-server";
import { MemoryStore, createThemeKey } from "../../src/services/memory-store";
import { RelayStateStore } from "../../src/services/relay-state-store";
import { WorkspaceStore } from "../../src/services/workspace-store";

let activeServer: ReturnType<typeof createBridgeServer> | undefined;
let activeMemoryStore: MemoryStore | undefined;
const tempDirs: string[] = [];

afterEach(async () => {
  activeMemoryStore?.close();
  activeMemoryStore = undefined;

  while (tempDirs.length > 0) {
    const current = tempDirs.pop();
    if (current) {
      fs.rmSync(current, { recursive: true, force: true });
    }
  }

  if (activeServer) {
    await new Promise<void>((resolve, reject) => {
      activeServer?.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    activeServer = undefined;
  }
});

describe("automations route", () => {
  it("returns the real turn-checkpoint automation for the active workspace", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-automations-route-"));
    tempDirs.push(dir);
    activeMemoryStore = new MemoryStore(path.join(dir, "relay-memory.db"));
    const workspaceStore = new WorkspaceStore(new RelayStateStore(path.join(dir, "relay-state.json")));
    const workspace = workspaceStore.open(dir);

    workspaceStore.saveSessionListSnapshot(workspace.id, [
      {
        id: "session-1",
        workspaceId: workspace.id,
        title: "当前会话",
        turnCount: 34,
        messages: [],
        createdAt: "2026-04-04T04:00:00.000Z",
        updatedAt: "2026-04-04T04:35:00.000Z",
      },
    ]);
    workspaceStore.saveSessionDetailSnapshot({
      id: "session-1",
      workspaceId: workspace.id,
      title: "当前会话",
      turnCount: 34,
      messages: [],
      createdAt: "2026-04-04T04:00:00.000Z",
      updatedAt: "2026-04-04T04:35:00.000Z",
    });
    workspaceStore.setPreferredSessionId(workspace.id, "session-1");

    activeMemoryStore.create({
      sessionId: "session-1",
      workspaceId: workspace.id,
      themeTitle: "当前会话",
      themeKey: createThemeKey("当前会话"),
      sessionTitleSnapshot: "当前会话",
      memoryDate: "2026-04-04",
      checkpointTurnCount: 20,
      promptVersion: "timeline-memory/v1",
      title: "当前会话 · 20轮时间线记忆",
      content: "内容",
      status: "completed",
      createdAt: "2026-04-04T04:40:00.000Z",
      updatedAt: "2026-04-04T04:40:00.000Z",
    });

    activeServer = createBridgeServer({
      memoryStore: activeMemoryStore,
      workspaceStore,
    });

    await new Promise<void>((resolve, reject) => {
      activeServer?.listen(0, "127.0.0.1", (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    const address = activeServer.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/automations`);
    const data = (await response.json()) as {
      items: Array<{
        id: string;
        intervalTurns: number;
        turnsUntilNextRun: number | null;
        nextCheckpointTurnCount: number | null;
        lastRunAt: string | null;
      }>;
    };

    expect(response.status).toBe(200);
    expect(data.items).toHaveLength(1);
    expect(data.items[0]?.id).toBe("timeline-memory-turn-checkpoint");
    expect(data.items[0]?.intervalTurns).toBe(20);
    expect(data.items[0]?.turnsUntilNextRun).toBe(6);
    expect(data.items[0]?.nextCheckpointTurnCount).toBe(40);
    expect(data.items[0]?.lastRunAt).toBe("2026-04-04T04:40:00.000Z");
  });

  it("creates, starts, and records a goal-loop automation run", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-goal-automation-route-"));
    tempDirs.push(dir);
    activeMemoryStore = new MemoryStore(path.join(dir, "relay-memory.db"));
    const workspaceStore = new WorkspaceStore(new RelayStateStore(path.join(dir, "relay-state.json")));
    workspaceStore.open(dir);
    const threads: AppServerThread[] = [];
    let threadCounter = 0;

    activeServer = createBridgeServer({
      memoryStore: activeMemoryStore,
      workspaceStore,
      codexAppServerService: new CodexAppServerService({
        async threadStart({ cwd }) {
          threadCounter += 1;
          const now = Math.floor(Date.now() / 1000);
          const thread: AppServerThread = {
            id: threadCounter === 1 ? "goal-thread-1" : `eval-thread-${threadCounter}`,
            preview: "",
            createdAt: now,
            updatedAt: now,
            cwd,
            name: null,
            turns: [],
          };
          threads.push(thread);
          return thread;
        },
        async threadSetName(threadId, name) {
          const thread = threads.find((item) => item.id === threadId);
          if (thread) {
            thread.name = name;
          }
        },
        async threadRead(threadId) {
          const thread = threads.find((item) => item.id === threadId);
          if (!thread) {
            throw new Error("thread not found");
          }
          return thread;
        },
        async threadArchive() {
          return;
        },
        async startTurnStream(threadId, input) {
          const thread = threads.find((item) => item.id === threadId);
          if (!thread) {
            throw new Error("thread not found");
          }

          const text = input.find((item) => item.type === "text")?.text ?? "";
          const assistantText = threadId.startsWith("eval-thread")
            ? '{"done":true,"reason":"目标已完成","nextUserPrompt":null}'
            : "目标推进已经完成。";
          const turnId = `${threadId}-turn-${thread.turns.length + 1}`;

          thread.preview = assistantText;
          thread.updatedAt = Math.floor(Date.now() / 1000);
          thread.turns.push({
            id: turnId,
            status: "completed",
            error: null,
            items: [
              {
                type: "userMessage",
                id: `${turnId}-user`,
                content: [{ type: "text", text }],
              },
              {
                type: "agentMessage",
                id: `${turnId}-assistant`,
                text: assistantText,
              },
            ],
          });

          async function* notifications(): AsyncIterable<AppServerNotification> {
            yield {
              method: "item/agentMessage/delta",
              params: {
                threadId,
                turnId,
                itemId: `${turnId}-assistant`,
                delta: assistantText,
              },
            };
            yield {
              method: "item/completed",
              params: {
                threadId,
                turnId,
                item: { type: "agentMessage", id: `${turnId}-assistant`, text: assistantText },
              },
            };
            yield {
              method: "turn/completed",
              params: {
                threadId,
                turn: { id: turnId, status: "completed", error: null },
              },
            };
          }

          return { turnId, notifications: notifications() };
        },
      }),
    });

    await new Promise<void>((resolve, reject) => {
      activeServer?.listen(0, "127.0.0.1", (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    const address = activeServer.address() as AddressInfo;
    const createResponse = await fetch(`http://127.0.0.1:${address.port}/automations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "goal-loop",
        title: "目标自动推进",
        goal: "完成一个真实的自动推进测试",
        targetSessionMode: "new-session",
        maxTurns: 10,
        maxDurationMinutes: 120,
      }),
    });
    const createData = (await createResponse.json()) as { item: { id: string } };

    expect(createResponse.status).toBe(200);

    const startResponse = await fetch(`http://127.0.0.1:${address.port}/automations/${createData.item.id}/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });

    expect(startResponse.status).toBe(200);

    let runs: GoalAutomationRunRecord[] = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const runsResponse = await fetch(`http://127.0.0.1:${address.port}/automations/${createData.item.id}/runs?limit=10`);
      const runsData = (await runsResponse.json()) as { items: GoalAutomationRunRecord[] };
      runs = runsData.items;

      if (runs.length > 0) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("completed");
    expect(runs[0]?.summary).toContain("目标已完成");

    const listResponse = await fetch(`http://127.0.0.1:${address.port}/automations`);
    const listData = (await listResponse.json()) as {
      items: AutomationRule[];
    };
    const goalItem = listData.items.find((item) => item.kind === "goal-loop");

    expect(goalItem?.kind).toBe("goal-loop");
    expect(goalItem?.sessionId).toBe("goal-thread-1");
  });

  it("normalizes stale running goal-loop rules after bridge restart so they can be managed again", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-goal-automation-stale-"));
    tempDirs.push(dir);
    activeMemoryStore = new MemoryStore(path.join(dir, "relay-memory.db"));
    const relayStateStore = new RelayStateStore(path.join(dir, "relay-state.json"));
    const workspaceStore = new WorkspaceStore(relayStateStore);
    const workspace = workspaceStore.open(dir);

    relayStateStore.saveInternalAutomationRule({
      id: "goal-stale-1",
      kind: "goal-loop",
      title: "Stale Goal",
      goal: "finish the stale run",
      status: "active",
      workspaceId: workspace.id,
      targetSessionMode: "new-session",
      targetSessionId: null,
      targetSessionTitle: "Stale Session",
      maxTurns: 10,
      maxDurationMinutes: 120,
      createdAt: "2026-04-04T04:40:00.000Z",
      updatedAt: "2026-04-04T04:40:00.000Z",
    });
    relayStateStore.saveInternalAutomationRunState({
      ruleId: "goal-stale-1",
      runStatus: "running",
      startedAt: "2026-04-04T04:40:00.000Z",
      updatedAt: "2026-04-04T04:41:00.000Z",
      finishedAt: null,
      currentTurnCount: 2,
      stopReason: null,
      lastEvaluationReason: "still running",
      lastAssistantSummary: "working",
      lastError: null,
      latestRunId: "stale-run-1",
      latestUserPrompt: "continue",
      sessionId: "stale-session-1",
      sessionTitle: "Stale Session",
      recentRuns: [],
    });

    activeServer = createBridgeServer({
      memoryStore: activeMemoryStore,
      workspaceStore,
      relayStateStore,
    });

    await new Promise<void>((resolve, reject) => {
      activeServer?.listen(0, "127.0.0.1", (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    const address = activeServer.address() as AddressInfo;
    const listResponse = await fetch(`http://127.0.0.1:${address.port}/automations`);
    const listData = (await listResponse.json()) as { items: AutomationRule[] };
    const goalItem = listData.items.find((item) => item.kind === "goal-loop");

    expect(goalItem?.kind).toBe("goal-loop");
    if (goalItem?.kind === "goal-loop") {
      expect(goalItem.runStatus).toBe("failed");
      expect(goalItem.capabilities.canDelete).toBe(true);
      expect(goalItem.capabilities.canEdit).toBe(true);
      expect(goalItem.lastError).toContain("Relay restarted");
    }

    const deleteResponse = await fetch(`http://127.0.0.1:${address.port}/automations/goal-stale-1`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
    });
    const deleteData = (await deleteResponse.json()) as { ok: boolean };

    expect(deleteResponse.status).toBe(200);
    expect(deleteData.ok).toBe(true);
  });
});
