import type { Session, TimelineMemory, Workspace } from "@relay/shared-types";
import { MemoryStore, createThemeKey, getMemoryPromptDefinition } from "@relay/memory-core";

import { CodexAppServerService, type AppServerNotification } from "./codex-app-server";
import { WorkspaceStore } from "./workspace-store";

type GenerateTimelineMemoryText = (input: {
  session: Session;
  workspace: Workspace;
  checkpointTurnCount: number;
}) => Promise<string>;

type TimelineMemoryServiceDependencies = {
  memoryStore: MemoryStore;
  workspaceStore: WorkspaceStore;
  codexAppServerService: CodexAppServerService;
  generateTimelineMemoryText?: GenerateTimelineMemoryText;
};

class TimelineMemoryService {
  private readonly dependencies: TimelineMemoryServiceDependencies;
  private readonly generateTimelineMemoryText: GenerateTimelineMemoryText;

  constructor(dependencies: TimelineMemoryServiceDependencies) {
    this.dependencies = dependencies;
    this.generateTimelineMemoryText =
      dependencies.generateTimelineMemoryText ?? ((input) => this.generateWithCodex(input));
  }

  async maybeGenerateForSession(sessionId: string) {
    return this.generateForSession(sessionId);
  }

  async generateForSession(
    sessionId: string,
    options: {
      force?: boolean;
      manual?: boolean;
    } = {},
  ) {
    const session = this.dependencies.workspaceStore.getSessionDetailSnapshot(sessionId);
    if (!session) {
      return null;
    }

    const checkpointTurnCount = options.manual
      ? session.turnCount
      : Math.floor(session.turnCount / 20) * 20;

    if (checkpointTurnCount === 0) {
      return null;
    }

    const existing = this.dependencies.memoryStore.getByCheckpoint(session.id, checkpointTurnCount);
    if (existing && !options.force) {
      return existing;
    }

    const workspace = this.dependencies.workspaceStore.get(session.workspaceId);
    if (!workspace) {
      return null;
    }

    try {
      if (existing && options.force) {
        this.dependencies.memoryStore.deleteByCheckpoint(session.id, checkpointTurnCount);
      }

      const content = await this.generateTimelineMemoryText({
        session,
        workspace,
        checkpointTurnCount,
      });

      return this.dependencies.memoryStore.create({
        sessionId: session.id,
        workspaceId: session.workspaceId,
        themeTitle: session.title,
        themeKey: createThemeKey(session.title),
        sessionTitleSnapshot: session.title,
        memoryDate: new Date().toISOString().slice(0, 10),
        checkpointTurnCount,
        promptVersion: getMemoryPromptDefinition("timeline").version,
        title: `${session.title} · ${checkpointTurnCount}轮时间线记忆`,
        content: content.trim(),
        status: "completed",
        sourceThreadUpdatedAt: session.updatedAt,
      });
    } catch {
      return null;
    }
  }

  private async generateWithCodex(input: {
    session: Session;
    workspace: Workspace;
    checkpointTurnCount: number;
  }) {
    const thread = await this.dependencies.codexAppServerService.threadStart({
      cwd: input.workspace.localPath,
    });

    try {
      const promptDefinition = getMemoryPromptDefinition("timeline");
      const turnStream = await this.dependencies.codexAppServerService.startTurnStream(
        thread.id,
        promptDefinition.buildPrompt(input.session, input.checkpointTurnCount),
      );
      return await collectAssistantText(turnStream.notifications);
    } finally {
      await this.dependencies.codexAppServerService.threadArchive(thread.id).catch(() => undefined);
    }
  }
}

async function collectAssistantText(notifications: AsyncIterable<AppServerNotification>) {
  let text = "";

  for await (const notification of notifications) {
    if (
      notification.method === "item/agentMessage/delta" &&
      notification.params &&
      typeof notification.params.delta === "string"
    ) {
      text += notification.params.delta;
      continue;
    }

    if (
      notification.method === "item/completed" &&
      notification.params &&
      notification.params.item &&
      typeof notification.params.item === "object" &&
      "type" in notification.params.item &&
      notification.params.item.type === "agentMessage" &&
      "text" in notification.params.item &&
      typeof notification.params.item.text === "string" &&
      text.trim().length === 0
    ) {
      text = notification.params.item.text;
      continue;
    }

    if (
      notification.method === "turn/completed" &&
      notification.params &&
      notification.params.turn &&
      typeof notification.params.turn === "object" &&
      "status" in notification.params.turn &&
      notification.params.turn.status !== "completed"
    ) {
      throw new Error("Timeline memory generation failed");
    }
  }

  return text.trim();
}

export { TimelineMemoryService };
