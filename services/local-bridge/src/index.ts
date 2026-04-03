import http from "node:http";

import { handleFilesRoute } from "./routes/files";
import { getHealthPayload } from "./routes/health";
import { handleMemoriesRoute } from "./routes/memories";
import { handleRuntimeRoute } from "./routes/runtime";
import { handleSessionsRoute } from "./routes/sessions";
import { handleWorkspacesRoute } from "./routes/workspaces";
import { CodexAppServerService } from "./services/codex-app-server";
import { MemoryStore } from "./services/memory-store";
import { pickWorkspaceFolder } from "./services/workspace-picker";
import { RuntimeEventBus } from "./services/runtime-event-bus";
import { SessionStore } from "./services/session-store";
import { TimelineMemoryService } from "./services/timeline-memory-service";
import { WorkspaceStore } from "./services/workspace-store";

type BridgeServerDependencies = {
  workspaceStore?: WorkspaceStore;
  sessionStore?: SessionStore;
  memoryStore?: MemoryStore;
  codexAppServerService?: CodexAppServerService;
  timelineMemoryService?: TimelineMemoryService;
  runtimeEventBus?: RuntimeEventBus;
  workspacePicker?: () => Promise<string | null>;
  finderOpener?: (targetPath: string, isDirectory: boolean) => void;
};

function createBridgeServer(dependencies: BridgeServerDependencies = {}) {
  const workspaceStore = dependencies.workspaceStore ?? new WorkspaceStore();
  const sessionStore = dependencies.sessionStore ?? new SessionStore();
  const memoryStore = dependencies.memoryStore ?? new MemoryStore();
  const codexAppServerService =
    dependencies.codexAppServerService ?? new CodexAppServerService();
  const timelineMemoryService =
    dependencies.timelineMemoryService ??
    new TimelineMemoryService({
      memoryStore,
      workspaceStore,
      codexAppServerService,
    });
  const runtimeEventBus = dependencies.runtimeEventBus ?? new RuntimeEventBus();
  const workspacePicker = dependencies.workspacePicker ?? pickWorkspaceFolder;
  const finderOpener = dependencies.finderOpener;

  return http.createServer((request, response) => {
    void (async () => {
      if (await handleWorkspacesRoute(request, response, workspaceStore, workspacePicker, codexAppServerService)) {
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
