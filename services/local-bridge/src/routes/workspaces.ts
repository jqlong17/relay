import type { IncomingMessage, ServerResponse } from "node:http";

import { readJsonBody } from "./json-body";
import { WorkspaceStore } from "../services/workspace-store";

async function handleWorkspacesRoute(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  workspaceStore: WorkspaceStore,
  workspacePicker: () => Promise<string | null>,
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
