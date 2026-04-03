import type { IncomingMessage, ServerResponse } from "node:http";

import { readJsonBody } from "./json-body";
import { CodexAppServerService } from "../services/codex-app-server";
import { WorkspaceStore } from "../services/workspace-store";

async function handleWorkspacesRoute(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  workspaceStore: WorkspaceStore,
  workspacePicker: () => Promise<string | null>,
  codexAppServerService: CodexAppServerService,
) {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && request.url === "/workspaces") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ items: workspaceStore.list(), active: workspaceStore.getActive() }));
    return true;
  }

  if (request.method === "POST" && request.url === "/workspaces/open") {
    const body = await readJsonBody<{ localPath: string }>(request);
    const workspace = workspaceStore.open(body.localPath);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ item: workspace }));
    void warmWorkspaceThreads(codexAppServerService, workspaceStore, workspace.id, workspace.localPath);
    return true;
  }

  if (request.method === "POST" && request.url === "/workspaces/open-picker") {
    const localPath = await workspacePicker();

    if (!localPath) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ item: null, canceled: true }));
      return true;
    }

    const workspace = workspaceStore.open(localPath);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ item: workspace, canceled: false }));
    void warmWorkspaceThreads(codexAppServerService, workspaceStore, workspace.id, workspace.localPath);
    return true;
  }

  if (request.method === "DELETE" && requestUrl.pathname.startsWith("/workspaces/")) {
    const workspaceId = requestUrl.pathname.replace("/workspaces/", "");
    const removedWorkspace = workspaceStore.remove(workspaceId);

    if (!removedWorkspace) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Workspace not found" }));
      return true;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        ok: true,
        removedWorkspaceId: workspaceId,
        active: workspaceStore.getActive(),
      }),
    );
    return true;
  }

  return false;
}

export { handleWorkspacesRoute };

async function warmWorkspaceThreads(
  codexAppServerService: CodexAppServerService,
  workspaceStore: WorkspaceStore,
  workspaceId: string,
  localPath: string,
) {
  try {
    const threads = await codexAppServerService.threadList({ cwd: localPath });
    workspaceStore.saveSessionListSnapshot(
      workspaceId,
      threads.map((thread) => ({
        id: thread.id,
        workspaceId,
        title: thread.name ?? deriveThreadTitle(thread.preview),
        turnCount: thread.turns.length,
        messages: [],
        createdAt: new Date(thread.createdAt * 1000).toISOString(),
        updatedAt: new Date(thread.updatedAt * 1000).toISOString(),
      })),
    );
  } catch {
    // Ignore warmup failures; the UI will refresh on demand.
  }
}

function deriveThreadTitle(preview: string) {
  const normalized = preview.trim();
  if (!normalized) {
    return "New Session";
  }

  return normalized.length > 48 ? `${normalized.slice(0, 48)}…` : normalized;
}
