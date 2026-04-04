import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { parse, stringify } from "smol-toml";

import type { CodexAutomation, CodexAutomationInput, CodexAutomationRun } from "@/lib/codex-automations";

type NodeSqliteModule = typeof import("node:sqlite");
type AutomationToml = {
  name?: string;
  prompt?: string;
  status?: string;
  rrule?: string;
  cwds?: string[];
  model?: string;
  reasoning_effort?: string;
};

let databaseSyncCtorPromise: Promise<NodeSqliteModule["DatabaseSync"]> | null = null;

async function getDatabaseSync() {
  if (!databaseSyncCtorPromise) {
    databaseSyncCtorPromise = import("node:sqlite").then((module) => module.DatabaseSync);
  }

  return databaseSyncCtorPromise;
}

async function listCodexAutomations() {
  const db = await openAutomationDb();

  try {
    const rows = db.prepare(`
      SELECT
        id,
        name,
        status,
        next_run_at,
        last_run_at,
        cwds,
        rrule,
        created_at,
        updated_at,
        model,
        reasoning_effort
      FROM automations
      ORDER BY created_at DESC
    `).all() as Array<Record<string, unknown>>;

    return rows.map((row) => readAutomation(row));
  } finally {
    db.close();
  }
}

async function createCodexAutomation(input: CodexAutomationInput) {
  const id = randomUUID();
  const now = Date.now();
  const nextRunAt = computeNextRunAt(input.rrule, now);
  const db = await openAutomationDb();

  try {
    ensureAutomationDir(id);
    writeAutomationToml(id, input);
    db.prepare(`
      INSERT INTO automations (
        id, name, prompt, status, next_run_at, last_run_at, cwds, rrule, created_at, updated_at, model, reasoning_effort
      ) VALUES (
        @id, @name, @prompt, @status, @nextRunAt, NULL, @cwds, @rrule, @createdAt, @updatedAt, @model, @reasoningEffort
      )
    `).run({
      id,
      name: input.name,
      prompt: input.prompt,
      status: input.status,
      nextRunAt,
      cwds: JSON.stringify(input.cwds),
      rrule: input.rrule,
      createdAt: now,
      updatedAt: now,
      model: input.model ?? null,
      reasoningEffort: input.reasoningEffort ?? null,
    });

    return getCodexAutomation(id);
  } finally {
    db.close();
  }
}

async function updateCodexAutomation(id: string, input: CodexAutomationInput) {
  const existing = await getCodexAutomation(id);

  if (!existing) {
    throw new Error("Automation not found");
  }

  const updatedAt = Date.now();
  const nextRunAt = computeNextRunAt(input.rrule, Date.now());
  const db = await openAutomationDb();

  try {
    ensureAutomationDir(id);
    writeAutomationToml(id, input);
    db.prepare(`
      UPDATE automations
      SET
        name = @name,
        prompt = @prompt,
        status = @status,
        next_run_at = @nextRunAt,
        cwds = @cwds,
        rrule = @rrule,
        updated_at = @updatedAt,
        model = @model,
        reasoning_effort = @reasoningEffort
      WHERE id = @id
    `).run({
      id,
      name: input.name,
      prompt: input.prompt,
      status: input.status,
      nextRunAt,
      cwds: JSON.stringify(input.cwds),
      rrule: input.rrule,
      updatedAt,
      model: input.model ?? null,
      reasoningEffort: input.reasoningEffort ?? null,
    });

    return getCodexAutomation(id);
  } finally {
    db.close();
  }
}

async function recordCodexAutomationRun(input: {
  automationId: string;
  title: string;
  summary: string | null;
  output: string | null;
  prompt: string | null;
  sourceCwd: string | null;
  runAt: number;
  nextRunAt: number | null;
}) {
  const db = await openAutomationDb();
  const threadId = randomUUID();
  const inboxId = randomUUID();

  try {
    db.prepare(`
      UPDATE automations
      SET last_run_at = @runAt, next_run_at = @nextRunAt, updated_at = @updatedAt
      WHERE id = @automationId
    `).run({
      automationId: input.automationId,
      runAt: input.runAt,
      nextRunAt: input.nextRunAt,
      updatedAt: input.runAt,
    });

    db.prepare(`
      INSERT INTO automation_runs (
        thread_id,
        automation_id,
        status,
        read_at,
        thread_title,
        source_cwd,
        inbox_title,
        inbox_summary,
        archived_user_message,
        archived_assistant_message,
        created_at,
        updated_at
      ) VALUES (
        @threadId,
        @automationId,
        'completed',
        NULL,
        @threadTitle,
        @sourceCwd,
        @inboxTitle,
        @inboxSummary,
        @archivedUserMessage,
        @archivedAssistantMessage,
        @createdAt,
        @updatedAt
      )
    `).run({
      threadId,
      automationId: input.automationId,
      threadTitle: input.title,
      sourceCwd: input.sourceCwd,
      inboxTitle: input.title,
      inboxSummary: input.summary,
      archivedUserMessage: input.prompt,
      archivedAssistantMessage: input.output,
      createdAt: input.runAt,
      updatedAt: input.runAt,
    });

    db.prepare(`
      INSERT INTO inbox_items (
        id,
        title,
        description,
        thread_id,
        read_at,
        created_at
      ) VALUES (
        @id,
        @title,
        @description,
        @threadId,
        NULL,
        @createdAt
      )
    `).run({
      id: inboxId,
      title: input.title,
      description: input.summary,
      threadId,
      createdAt: input.runAt,
    });

    return { threadId, inboxId };
  } finally {
    db.close();
  }
}

async function listCodexAutomationRuns(automationId: string, limit = 10) {
  const db = await openAutomationDb();

  try {
    const rows = db.prepare(`
      SELECT
        thread_id,
        automation_id,
        status,
        thread_title,
        source_cwd,
        inbox_title,
        inbox_summary,
        archived_user_message,
        archived_assistant_message,
        created_at,
        updated_at
      FROM automation_runs
      WHERE automation_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(automationId, Math.max(1, limit)) as Array<Record<string, unknown>>;

    return rows.map(readAutomationRunRow);
  } finally {
    db.close();
  }
}

async function getLatestCodexAutomationRun(automationId: string) {
  const [item] = await listCodexAutomationRuns(automationId, 1);
  return item ?? null;
}

function readAutomationRunRow(row: Record<string, unknown>): CodexAutomationRun {
  return {
    automationId: String(row.automation_id),
    threadId: String(row.thread_id),
    status: row.status === "failed" ? "failed" : "completed",
    title: row.inbox_title ? String(row.inbox_title) : row.thread_title ? String(row.thread_title) : null,
    summary: row.inbox_summary ? String(row.inbox_summary) : null,
    output: row.archived_assistant_message ? String(row.archived_assistant_message) : null,
    prompt: row.archived_user_message ? String(row.archived_user_message) : null,
    sourceCwd: row.source_cwd ? String(row.source_cwd) : null,
    createdAt: Number(row.created_at ?? Date.now()),
    updatedAt: Number(row.updated_at ?? Date.now()),
  };
}

async function deleteCodexAutomation(id: string) {
  const db = await openAutomationDb();

  try {
    db.prepare("DELETE FROM automation_runs WHERE automation_id = ?").run(id);
    const result = db.prepare("DELETE FROM automations WHERE id = ?").run(id) as { changes: number };
    const automationDir = resolveAutomationDir(id);
    fs.rmSync(automationDir, { recursive: true, force: true });
    return result.changes > 0;
  } finally {
    db.close();
  }
}

async function getCodexAutomation(id: string) {
  const db = await openAutomationDb();

  try {
    const row = db.prepare(`
      SELECT
        id,
        name,
        status,
        next_run_at,
        last_run_at,
        cwds,
        rrule,
        created_at,
        updated_at,
        model,
        reasoning_effort
      FROM automations
      WHERE id = ?
    `).get(id) as Record<string, unknown> | undefined;

    return row ? readAutomation(row) : null;
  } finally {
    db.close();
  }
}

function readAutomation(row: Record<string, unknown>): CodexAutomation {
  const id = String(row.id);
  const toml = readAutomationToml(id);

  return {
    id,
    name: String(row.name ?? toml.name ?? ""),
    prompt: String(toml.prompt ?? ""),
    status: (row.status === "PAUSED" ? "PAUSED" : "ACTIVE"),
    rrule: String(row.rrule ?? toml.rrule ?? ""),
    cwds: parseCwds(row.cwds, toml.cwds),
    createdAt: Number(row.created_at ?? Date.now()),
    updatedAt: Number(row.updated_at ?? Date.now()),
    lastRunAt: row.last_run_at === null || row.last_run_at === undefined ? null : Number(row.last_run_at),
    nextRunAt: row.next_run_at === null || row.next_run_at === undefined ? null : Number(row.next_run_at),
    model: row.model ? String(row.model) : toml.model ?? null,
    reasoningEffort: row.reasoning_effort ? String(row.reasoning_effort) : toml.reasoning_effort ?? null,
  };
}

function parseCwds(raw: unknown, fallback: string[] | undefined) {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string");
      }
    } catch {}
  }

  return Array.isArray(fallback) ? fallback.filter((item): item is string => typeof item === "string") : [];
}

function readAutomationToml(id: string): AutomationToml {
  const filePath = path.join(resolveAutomationDir(id), "automation.toml");

  if (!fs.existsSync(filePath)) {
    return {};
  }

  return parse(fs.readFileSync(filePath, "utf8")) as AutomationToml;
}

function writeAutomationToml(id: string, input: CodexAutomationInput) {
  const filePath = path.join(resolveAutomationDir(id), "automation.toml");
  const toml = stringify({
    name: input.name,
    prompt: input.prompt,
    status: input.status,
    rrule: input.rrule,
    cwds: input.cwds,
    ...(input.model ? { model: input.model } : {}),
    ...(input.reasoningEffort ? { reasoning_effort: input.reasoningEffort } : {}),
  });
  fs.writeFileSync(filePath, toml);
}

function ensureAutomationDir(id: string) {
  fs.mkdirSync(resolveAutomationDir(id), { recursive: true });
}

function resolveAutomationDir(id: string) {
  return path.join(resolveCodexHome(), "automations", id);
}

function resolveCodexHome() {
  return process.env.CODEX_HOME ? path.resolve(process.env.CODEX_HOME) : path.join(os.homedir(), ".codex");
}

async function openAutomationDb() {
  const dbPath = path.join(resolveCodexHome(), "sqlite", "codex-dev.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const DatabaseSync = await getDatabaseSync();
  return new DatabaseSync(dbPath);
}

function computeNextRunAt(rrule: string, nowMs: number) {
  const now = new Date(nowMs);
  const parts = new Map(
    rrule.split(";").map((part) => {
      const [key, value] = part.split("=");
      return [key, value] as const;
    }),
  );

  if (parts.get("FREQ") === "HOURLY") {
    const interval = Number(parts.get("INTERVAL") ?? "1");
    return nowMs + interval * 60 * 60 * 1000;
  }

  if (parts.get("FREQ") === "WEEKLY") {
    const byHour = Number(parts.get("BYHOUR") ?? "0");
    const byMinute = Number(parts.get("BYMINUTE") ?? "0");
    const byDay = (parts.get("BYDAY") ?? "").split(",").filter(Boolean);
    const weekDays = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
    const allowedDays = byDay.map((day) => weekDays.indexOf(day)).filter((day) => day >= 0);

    for (let offset = 0; offset < 8; offset += 1) {
      const candidate = new Date(now);
      candidate.setDate(now.getDate() + offset);
      candidate.setHours(byHour, byMinute, 0, 0);

      if (!allowedDays.includes(candidate.getDay())) {
        continue;
      }

      if (candidate.getTime() > nowMs) {
        return candidate.getTime();
      }
    }
  }

  return nowMs + 24 * 60 * 60 * 1000;
}

export {
  computeNextRunAt,
  createCodexAutomation,
  deleteCodexAutomation,
  getCodexAutomation,
  listCodexAutomationRuns,
  listCodexAutomations,
  recordCodexAutomationRun,
  getLatestCodexAutomationRun,
  updateCodexAutomation,
};
