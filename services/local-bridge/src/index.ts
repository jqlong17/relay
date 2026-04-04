import http from "node:http";

import { MemoryStore } from "@relay/memory-core";

import { handleAutomationsRoute } from "./routes/automations";
import { handleFilesRoute } from "./routes/files";
import { getHealthPayload } from "./routes/health";
import { handleMemoriesRoute } from "./routes/memories";
import { handleRuntimeRoute } from "./routes/runtime";
import { handleSessionsRoute } from "./routes/sessions";
import { handleWorkspacesRoute } from "./routes/workspaces";
import { AutomationService } from "./services/automation-service";
import { CodexAppServerService } from "./services/codex-app-server";
import { pickWorkspaceFolder } from "./services/workspace-picker";
import { RelayStateStore } from "./services/relay-state-store";
import { RuntimeEventBus } from "./services/runtime-event-bus";
import { SessionStore } from "./services/session-store";
import { TimelineMemoryService } from "./services/timeline-memory-service";
import { WorkspaceStore } from "./services/workspace-store";

type BridgeServerDependencies = {
  relayStateStore?: RelayStateStore;
  workspaceStore?: WorkspaceStore;
  sessionStore?: SessionStore;
  memoryStore?: MemoryStore;
  codexAppServerService?: CodexAppServerService;
  timelineMemoryService?: TimelineMemoryService;
  automationService?: AutomationService;
  runtimeEventBus?: RuntimeEventBus;
  workspacePicker?: () => Promise<string | null>;
  finderOpener?: (targetPath: string, isDirectory: boolean) => void;
};

function createBridgeServer(dependencies: BridgeServerDependencies = {}) {
  const relayStateStore =
    dependencies.relayStateStore ??
    dependencies.workspaceStore?.getRelayStateStore() ??
    new RelayStateStore();
  const workspaceStore = dependencies.workspaceStore ?? new WorkspaceStore(relayStateStore);
  const sessionStore = dependencies.sessionStore ?? new SessionStore();
  const memoryStore = dependencies.memoryStore ?? new MemoryStore();
  const codexAppServerService =
    dependencies.codexAppServerService ?? new CodexAppServerService();
  const runtimeEventBus = dependencies.runtimeEventBus ?? new RuntimeEventBus();
  const timelineMemoryService =
    dependencies.timelineMemoryService ??
    new TimelineMemoryService({
      memoryStore,
      workspaceStore,
      codexAppServerService,
    });
  const automationService =
    dependencies.automationService ??
    new AutomationService({
      workspaceStore,
      memoryStore,
      relayStateStore,
      sessionStore,
      codexAppServerService,
      runtimeEventBus,
      timelineMemoryService,
    });
  const workspacePicker = dependencies.workspacePicker ?? pickWorkspaceFolder;
  const finderOpener = dependencies.finderOpener;

  return http.createServer((request, response) => {
    void (async () => {
      if (await handleWorkspacesRoute(request, response, workspaceStore, workspacePicker, codexAppServerService)) {
        return;
      }

      if (await handleAutomationsRoute(request, response, automationService)) {
        return;
      }

      if (await handleFilesRoute(request, response, workspaceStore, finderOpener)) {
        return;
      }

      if (await handleMemoriesRoute(request, response, memoryStore, timelineMemoryService)) {
        return;
      }

      if (
        await handleSessionsRoute(
          request,
          response,
          workspaceStore,
          sessionStore,
          codexAppServerService,
          runtimeEventBus,
        )
      ) {
        return;
      }

      if (
        await handleRuntimeRoute(
          request,
          response,
          workspaceStore,
          sessionStore,
          codexAppServerService,
          timelineMemoryService,
          runtimeEventBus,
        )
      ) {
        return;
      }

      if (request.method === "GET" && request.url === "/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(getHealthPayload()));
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Not Found" }));
    })().catch((error: unknown) => {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Internal Server Error",
        }),
      );
    });
  });
}

export { createBridgeServer };
export type { BridgeServerDependencies };
