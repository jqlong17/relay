import type { CodexAutomation, CodexAutomationInput, CodexAutomationRun } from "@/lib/codex-automations";

async function listCodexAutomations() {
  return fetchJson<{ items: CodexAutomation[] }>("/api/codex-automations");
}

async function createCodexAutomation(input: CodexAutomationInput) {
  return fetchJson<{ item: CodexAutomation }>("/api/codex-automations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

async function updateCodexAutomation(id: string, input: CodexAutomationInput) {
  return fetchJson<{ item: CodexAutomation }>(`/api/codex-automations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

async function deleteCodexAutomation(id: string) {
  return fetchJson<{ ok: boolean }>(`/api/codex-automations/${id}`, {
    method: "DELETE",
  });
}

async function runCodexAutomationNow(id: string) {
  return fetchJson<{ ok: boolean; output: string; summary: string; nextRunAt: number | null }>(
    `/api/codex-automations/${id}/run`,
    {
      method: "POST",
    },
  );
}

async function getCodexAutomationLatestRun(id: string) {
  return fetchJson<{ item: CodexAutomationRun | null }>(`/api/codex-automations/${id}/run`);
}

async function listCodexAutomationRuns(id: string, limit = 10) {
  return fetchJson<{ item?: CodexAutomationRun | null; items?: CodexAutomationRun[] }>(
    `/api/codex-automations/${id}/run?limit=${limit}`,
  ).then((response) => {
    const items = Array.isArray(response.items)
      ? response.items
      : response.item
        ? [response.item]
        : [];

    return {
      item: response.item ?? items[0] ?? null,
      items,
    };
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
  createCodexAutomation,
  deleteCodexAutomation,
  getCodexAutomationLatestRun,
  listCodexAutomationRuns,
  listCodexAutomations,
  runCodexAutomationNow,
  updateCodexAutomation,
};
