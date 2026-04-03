import http from "node:http";

import { handleFilesRoute } from "./routes/files";
import { getHealthPayload } from "./routes/health";
import { handleRuntimeRoute } from "./routes/runtime";
import { handleSessionsRoute } from "./routes/sessions";
import { handleWorkspacesRoute } from "./routes/workspaces";
import { CodexAppServerService } from "./services/codex-app-server";
import { pickWorkspaceFolder } from "./services/workspace-picker";
import { SessionStore } from "./services/session-store";
import { WorkspaceStore } from "./services/workspace-store";

type BridgeServerDependencies = {
  workspaceStore?: WorkspaceStore;
  sessionStore?: SessionStore;
  codexAppServerService?: CodexAppServerService;
  workspacePicker?: () => Promise<string | null>;
  finderOpener?: (targetPath: string, isDirectory: boolean) => void;
};

function createBridgeServer(dependencies: BridgeServerDependencies = {}) {
  const workspaceStore = dependencies.workspaceStore ?? new WorkspaceStore();
  const sessionStore = dependencies.sessionStore ?? new SessionStore();
  const codexAppServerService =
    dependencies.codexAppServerService ?? new CodexAppServerService();
  const workspacePicker = dependencies.workspacePicker ?? pickWorkspaceFolder;
  const finderOpener = dependencies.finderOpener;

  return http.createServer((request, response) => {
    void (async () => {
      if (await handleWorkspacesRoute(request, response, workspaceStore, workspacePicker)) {
        return;
      }

      if (await handleFilesRoute(request, response, workspaceStore, finderOpener)) {
        return;
      }

      if (await handleSessionsRoute(request, response, workspaceStore, sessionStore, codexAppServerService)) {
        return;
      }

      if (
        await handleRuntimeRoute(
          request,
          response,
          workspaceStore,
          sessionStore,
          codexAppServerService,
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
