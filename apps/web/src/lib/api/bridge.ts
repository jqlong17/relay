import type { FileTreeNode, RuntimeEvent, Session, Workspace } from "@relay/shared-types";

import { consumeRuntimeEventStream } from "@/lib/stream/runtime-stream";

type FilePreview = {
  path: string;
  name: string;
  content: string;
  extension: string;
};

type SessionListResponse = {
  items: Session[];
  activeWorkspaceId: string | null;
  preferredSessionId?: string | null;
  source?: "fresh" | "snapshot";
};

type SessionDetailResponse = {
  item: Session;
  source?: "fresh" | "snapshot";
};

async function listWorkspaces() {
  return fetchJson<{ items: Workspace[]; active: Workspace | null }>("/api/bridge/workspaces");
}

async function openWorkspace(localPath: string) {
  return fetchJson<{ item: Workspace }>("/api/bridge/workspaces", {
    method: "POST",
    body: JSON.stringify({ localPath }),
  });
}

async function openWorkspacePicker() {
  return fetchJson<{ item: Workspace | null; canceled: boolean }>("/api/bridge/workspaces?mode=picker", {
    method: "POST",
  });
}

async function removeWorkspace(workspaceId: string) {
  return fetchJson<{ ok: boolean; removedWorkspaceId: string; active: Workspace | null }>(
    `/api/bridge/workspaces/${workspaceId}`,
    {
      method: "DELETE",
    },
  );
}

async function listSessions(options?: { fresh?: boolean }) {
  const search = options?.fresh ? "?fresh=1" : "";
  return fetchJson<SessionListResponse>(`/api/bridge/sessions${search}`);
}

async function createSession(title: string) {
  return fetchJson<{ item: Session }>("/api/bridge/sessions", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

async function getSession(sessionId: string, options?: { fresh?: boolean }) {
  const search = options?.fresh ? "?fresh=1" : "";
  return fetchJson<SessionDetailResponse>(`/api/bridge/sessions/${sessionId}${search}`);
}

async function archiveSession(sessionId: string) {
  return fetchJson<{ ok: boolean; archivedSessionId: string }>(`/api/bridge/sessions/${sessionId}?action=archive`, {
    method: "POST",
  });
}

async function renameSession(sessionId: string, title: string) {
  return fetchJson<{ ok: boolean; item: Session }>(`/api/bridge/sessions/${sessionId}?action=rename`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

async function selectSession(sessionId: string) {
  return fetchJson<{ ok: boolean; sessionId: string; workspaceId: string }>(`/api/bridge/sessions/${sessionId}?action=select`, {
    method: "POST",
  });
}

async function runSession(sessionId: string, content: string) {
  return fetchJson<{ sessionId: string; events: RuntimeEvent[] }>("/api/bridge/runtime/run", {
    method: "POST",
    body: JSON.stringify({ sessionId, content }),
  });
}

async function runSessionStream(
  sessionId: string,
  content: string,
  onEvent: (event: RuntimeEvent) => void,
) {
  const response = await fetch("/api/bridge/runtime/run?stream=1", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ sessionId, content }),
  });

  await consumeRuntimeEventStream(response, onEvent);
}

async function getFileTree() {
  return fetchJson<{ item: FileTreeNode; workspaceId: string }>("/api/bridge/files/tree");
}

async function getFilePreview(filePath: string) {
  return fetchJson<{ item: FilePreview }>(`/api/bridge/files/content?path=${encodeURIComponent(filePath)}`);
}

async function openInFinder(targetPath: string) {
  return fetchJson<{ ok: boolean; path: string }>("/api/bridge/files/open", {
    method: "POST",
    body: JSON.stringify({ path: targetPath }),
  });
}

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const raw = await response.text();
    let message = raw;

    try {
      const parsed = JSON.parse(raw) as { error?: string };
      if (parsed.error) {
        message = parsed.error;
      }
    } catch {}

    throw new Error(message || "Request failed");
  }

  return (await response.json()) as T;
}

export {
  archiveSession,
  createSession,
  getFilePreview,
  getFileTree,
  getSession,
  openInFinder,
  listSessions,
  listWorkspaces,
  openWorkspace,
  openWorkspacePicker,
  renameSession,
  removeWorkspace,
  runSession,
  runSessionStream,
  selectSession,
};
export type { FilePreview };
