import type { IncomingMessage, ServerResponse } from "node:http";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { buildFileTree } from "../services/file-tree";
import { readJsonBody } from "./json-body";
import { WorkspaceStore } from "../services/workspace-store";

async function handleFilesRoute(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  workspaceStore: WorkspaceStore,
  finderOpener: (targetPath: string, isDirectory: boolean) => void = openInFinder,
) {
  if (request.method === "GET" && request.url === "/files/tree") {
    const activeWorkspace = workspaceStore.getActive();

    if (!activeWorkspace) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "No active workspace" }));
      return true;
    }

    const tree = buildFileTree(activeWorkspace.localPath);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ item: tree, workspaceId: activeWorkspace.id }));
    return true;
  }

  if (request.method === "GET" && request.url?.startsWith("/files/tree?")) {
    const activeWorkspace = workspaceStore.getActive();

    if (!activeWorkspace) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "No active workspace" }));
      return true;
    }

    const requestUrl = new URL(request.url, "http://127.0.0.1");
    const requestedPath = requestUrl.searchParams.get("path");
    const depthParam = Number.parseInt(requestUrl.searchParams.get("depth") ?? "2", 10);
    const depth = Number.isFinite(depthParam) ? Math.min(Math.max(depthParam, 1), 4) : 2;

    let targetPath = activeWorkspace.localPath;

    if (requestedPath) {
      try {
        targetPath = resolveWorkspacePath(activeWorkspace.localPath, requestedPath);
      } catch (error) {
        response.writeHead(403, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : "Path is outside the active workspace",
          }),
        );
        return true;
      }
    }

    const tree = buildFileTree(targetPath, depth);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ item: tree, workspaceId: activeWorkspace.id }));
    return true;
  }

  if (request.method === "GET" && request.url?.startsWith("/files/content")) {
    const activeWorkspace = workspaceStore.getActive();

    if (!activeWorkspace) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "No active workspace" }));
      return true;
    }

    const requestUrl = new URL(request.url, "http://127.0.0.1");
    const requestedPath = requestUrl.searchParams.get("path");

    if (!requestedPath) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Missing file path" }));
      return true;
    }

    let resolvedPath: string;

    try {
      resolvedPath = resolveWorkspacePath(activeWorkspace.localPath, requestedPath);
    } catch (error) {
      response.writeHead(403, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "File is outside the active workspace",
        }),
      );
      return true;
    }

    if (!fs.existsSync(resolvedPath)) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "File not found" }));
      return true;
    }

    const stat = fs.statSync(resolvedPath);

    if (!stat.isFile()) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Only files can be previewed" }));
      return true;
    }

    const content = fs.readFileSync(resolvedPath, "utf8");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        item: {
          path: resolvedPath,
          name: path.basename(resolvedPath),
          content,
          extension: path.extname(resolvedPath).toLowerCase(),
        },
      }),
    );
    return true;
  }

  if (request.method === "POST" && request.url?.startsWith("/files/open-in-finder")) {
    const activeWorkspace = workspaceStore.getActive();

    if (!activeWorkspace) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "No active workspace" }));
      return true;
    }

    const body = await readJsonBody<{ path: string }>(request);
    let resolvedPath: string;

    try {
      resolvedPath = resolveWorkspacePath(activeWorkspace.localPath, body.path);
    } catch (error) {
      response.writeHead(403, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Path is outside the active workspace",
        }),
      );
      return true;
    }

    if (!fs.existsSync(resolvedPath)) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "File or folder not found" }));
      return true;
    }

    const stat = fs.statSync(resolvedPath);
    finderOpener(resolvedPath, stat.isDirectory());
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, path: resolvedPath }));
    return true;
  }

  return false;
}

export { handleFilesRoute };

function resolveWorkspacePath(workspacePath: string, requestedPath: string) {
  const resolvedPath = path.resolve(requestedPath);
  const workspaceRoot = path.resolve(workspacePath);
  const relativePath = path.relative(workspaceRoot, resolvedPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Path is outside the active workspace");
  }

  return resolvedPath;
}

function openInFinder(targetPath: string, isDirectory: boolean) {
  if (process.platform === "darwin") {
    execFileSync("open", ["-R", targetPath]);
    return;
  }

  if (process.platform === "win32") {
    execFileSync("explorer.exe", [isDirectory ? targetPath : `/select,${targetPath}`]);
    return;
  }

  execFileSync("xdg-open", [isDirectory ? targetPath : path.dirname(targetPath)]);
}
