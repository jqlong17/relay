import type {
  AutomationRule,
  FileTreeNode,
  GoalAutomationRule,
  GoalAutomationRuleInput,
  GoalAutomationRunRecord,
  RelayDevice,
  RuntimeEvent,
  Session,
  TimelineMemory,
  Workspace,
} from "@relay/shared-types";

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

type SessionMemoriesResponse = {
  items: TimelineMemory[];
};

type AutomationRulesResponse = {
  items: AutomationRule[];
};

type GoalAutomationRuleResponse = {
  item: GoalAutomationRule;
};

type GoalAutomationRunsResponse = {
  items: GoalAutomationRunRecord[];
};

type LocalDeviceResponse = {
  item: RelayDevice;
};

type BridgeRuntimeEvent =
  | RuntimeEvent
  | {
      type: "thread.updated" | "thread.list.changed" | "thread.broken" | "thread.deleted_or_missing";
      sessionId?: string;
      workspaceId?: string;
      createdAt: string;
    };

type RuntimeEventSubscriptionOptions = {
  sessionId?: string;
  workspaceId?: string;
};

type SessionAttachment = {
  path: string;
  name: string;
  mimeType: string;
};

async function listWorkspaces() {
  return fetchJson<{ items: Workspace[]; active: Workspace | null }>("/api/bridge/workspaces");
}

async function getLocalDevice() {
  return fetchJson<LocalDeviceResponse>("/api/bridge/device");
}

async function bindLocalDevice(code: string) {
  return fetchJson<LocalDeviceResponse>("/api/bridge/device/bind", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
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

async function getSessionMemories(sessionId: string) {
  return fetchJson<SessionMemoriesResponse>(`/api/bridge/sessions/${sessionId}/memories`);
}

async function generateSessionMemory(sessionId: string, options?: { force?: boolean }) {
  const search = options?.force ? "?force=1" : "";
  return fetchJson<{ ok: boolean; item: TimelineMemory | null }>(`/api/bridge/sessions/${sessionId}/memories${search}`, {
    method: "POST",
  });
}

async function listMemories() {
  return fetchJson<SessionMemoriesResponse>("/api/bridge/memories");
}

async function listAutomations() {
  return fetchJson<AutomationRulesResponse>("/api/bridge/automations");
}

async function createGoalAutomationRule(input: GoalAutomationRuleInput) {
  return fetchJson<GoalAutomationRuleResponse>("/api/bridge/automations", {
    method: "POST",
    body: JSON.stringify({
      kind: "goal-loop",
      ...input,
    }),
  });
}

async function updateGoalAutomationRule(id: string, input: GoalAutomationRuleInput) {
  return fetchJson<GoalAutomationRuleResponse>(`/api/bridge/automations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

async function deleteAutomationRule(id: string) {
  return fetchJson<{ ok: boolean }>(`/api/bridge/automations/${id}`, {
    method: "DELETE",
  });
}

async function startAutomationRule(id: string) {
  return fetchJson<GoalAutomationRuleResponse>(`/api/bridge/automations/${id}/start`, {
    method: "POST",
  });
}

async function stopAutomationRule(id: string) {
  return fetchJson<GoalAutomationRuleResponse>(`/api/bridge/automations/${id}/stop`, {
    method: "POST",
  });
}

async function listGoalAutomationRuns(id: string, limit = 10) {
  return fetchJson<GoalAutomationRunsResponse>(`/api/bridge/automations/${id}/runs?limit=${limit}`);
}

async function listMemoriesByTheme(themeKey: string) {
  return fetchJson<SessionMemoriesResponse>(`/api/bridge/memories?themeKey=${encodeURIComponent(themeKey)}`);
}

async function listMemoriesByDate(date: string) {
  return fetchJson<SessionMemoriesResponse>(`/api/bridge/memories?date=${encodeURIComponent(date)}`);
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

async function runSession(sessionId: string, content: string, attachments: SessionAttachment[] = []) {
  return fetchJson<{ sessionId: string; events: RuntimeEvent[] }>("/api/bridge/runtime/run", {
    method: "POST",
    body: JSON.stringify({ sessionId, content, attachments }),
  });
}

async function runSessionStream(
  sessionId: string,
  content: string,
  attachments: SessionAttachment[],
  onEvent: (event: RuntimeEvent) => void,
) {
  const response = await fetch("/api/bridge/runtime/run?stream=1", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ sessionId, content, attachments }),
  });

  await consumeRuntimeEventStream(response, onEvent);
}

async function uploadSessionImage(sessionId: string, file: File) {
  const data = await fileToBase64(file);

  return fetchJson<{ item: SessionAttachment }>("/api/bridge/runtime/attachments", {
    method: "POST",
    body: JSON.stringify({
      sessionId,
      filename: file.name,
      mimeType: file.type,
      data,
    }),
  });
}

function subscribeRuntimeEvents(
  options: RuntimeEventSubscriptionOptions,
  onEvent: (event: BridgeRuntimeEvent) => void,
  onError?: (event: Event) => void,
) {
  if (typeof window === "undefined" || typeof window.EventSource === "undefined") {
    return () => {};
  }

  const searchParams = new URLSearchParams();
  if (options.sessionId) {
    searchParams.set("sessionId", options.sessionId);
  }
  if (options.workspaceId) {
    searchParams.set("workspaceId", options.workspaceId);
  }

  const query = searchParams.toString();
  const streamUrl = query ? `/api/bridge/runtime/events?${query}` : "/api/bridge/runtime/events";
  const source = new EventSource(streamUrl);

  const handleMessage = (event: MessageEvent<string>) => {
    const payload = event.data.trim();
    if (!payload) {
      return;
    }

    try {
      onEvent(JSON.parse(payload) as BridgeRuntimeEvent);
    } catch {}
  };

  const handleError = (event: Event) => {
    onError?.(event);
  };

  source.addEventListener("message", handleMessage);
  source.addEventListener("error", handleError);

  return () => {
    source.removeEventListener("message", handleMessage);
    source.removeEventListener("error", handleError);
    source.close();
  };
}

async function getFileTree(options?: { path?: string; depth?: number }) {
  const searchParams = new URLSearchParams();

  if (options?.path) {
    searchParams.set("path", options.path);
  }

  if (typeof options?.depth === "number") {
    searchParams.set("depth", String(options.depth));
  }

  const query = searchParams.toString();
  return fetchJson<{ item: FileTreeNode; workspaceId: string }>(
    query ? `/api/bridge/files/tree?${query}` : "/api/bridge/files/tree",
  );
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
  bindLocalDevice,
  createSession,
  getLocalDevice,
  getFilePreview,
  getFileTree,
  getSession,
  getSessionMemories,
  generateSessionMemory,
  openInFinder,
  listAutomations,
  createGoalAutomationRule,
  updateGoalAutomationRule,
  deleteAutomationRule,
  startAutomationRule,
  stopAutomationRule,
  listGoalAutomationRuns,
  listMemories,
  listSessions,
  listMemoriesByDate,
  listMemoriesByTheme,
  listWorkspaces,
  openWorkspace,
  openWorkspacePicker,
  renameSession,
  removeWorkspace,
  runSession,
  runSessionStream,
  subscribeRuntimeEvents,
  selectSession,
  uploadSessionImage,
};
export type { BridgeRuntimeEvent, FilePreview, SessionAttachment };

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}
