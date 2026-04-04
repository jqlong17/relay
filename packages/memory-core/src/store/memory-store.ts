import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import type { CreateTimelineMemoryInput, TimelineMemory } from "@relay/shared-types";

class MemoryStore {
  private readonly db: DatabaseSync;

  constructor(dbPath = resolveDefaultMemoryDbPath()) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.initialize();
  }

  create(input: CreateTimelineMemoryInput) {
    const now = input.createdAt ?? new Date().toISOString();
    const updatedAt = input.updatedAt ?? now;
    const id = randomUUID();

    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO timeline_memories (
          id,
          session_id,
          workspace_id,
          theme_title,
          theme_key,
          session_title_snapshot,
          memory_date,
          checkpoint_turn_count,
          prompt_version,
          title,
          content,
          status,
          source_thread_updated_at,
          generation_error,
          created_at,
          updated_at
        ) VALUES (
          @id,
          @sessionId,
          @workspaceId,
          @themeTitle,
          @themeKey,
          @sessionTitleSnapshot,
          @memoryDate,
          @checkpointTurnCount,
          @promptVersion,
          @title,
          @content,
          @status,
          @sourceThreadUpdatedAt,
          @generationError,
          @createdAt,
          @updatedAt
        )`,
      )
      .run({
        id,
        sessionId: input.sessionId,
        workspaceId: input.workspaceId,
        themeTitle: input.themeTitle,
        themeKey: input.themeKey,
        sessionTitleSnapshot: input.sessionTitleSnapshot,
        memoryDate: input.memoryDate,
        checkpointTurnCount: input.checkpointTurnCount,
        promptVersion: input.promptVersion,
        title: input.title,
        content: input.content,
        status: input.status,
        sourceThreadUpdatedAt: input.sourceThreadUpdatedAt ?? null,
        generationError: input.generationError ?? null,
        createdAt: now,
        updatedAt,
      }) as { changes: number };

    if (result.changes === 0) {
      const existing = this.getByCheckpoint(input.sessionId, input.checkpointTurnCount);
      if (!existing) {
        throw new Error("Timeline memory insert was ignored but no existing record was found");
      }

      return existing;
    }

    const inserted = this.getById(id);
    if (!inserted) {
      throw new Error(`Timeline memory not found after insert: ${id}`);
    }

    return inserted;
  }

  listBySessionId(sessionId: string) {
    return this.db
      .prepare(
        `SELECT * FROM timeline_memories
         WHERE session_id = ?
         ORDER BY created_at DESC`,
      )
      .all(sessionId)
      .map(mapRowToTimelineMemory);
  }

  listAll() {
    return this.db
      .prepare(
        `SELECT * FROM timeline_memories
         ORDER BY created_at DESC`,
      )
      .all()
      .map(mapRowToTimelineMemory);
  }

  listByWorkspaceId(workspaceId: string) {
    return this.db
      .prepare(
        `SELECT * FROM timeline_memories
         WHERE workspace_id = ?
         ORDER BY created_at DESC`,
      )
      .all(workspaceId)
      .map(mapRowToTimelineMemory);
  }

  listByDate(memoryDate: string) {
    return this.db
      .prepare(
        `SELECT * FROM timeline_memories
         WHERE memory_date = ?
         ORDER BY created_at DESC`,
      )
      .all(memoryDate)
      .map(mapRowToTimelineMemory);
  }

  listByThemeKey(themeKey: string) {
    return this.db
      .prepare(
        `SELECT * FROM timeline_memories
         WHERE theme_key = ?
         ORDER BY created_at DESC`,
      )
      .all(themeKey)
      .map(mapRowToTimelineMemory);
  }

  getByCheckpoint(sessionId: string, checkpointTurnCount: number) {
    const row = this.db
      .prepare(
        `SELECT * FROM timeline_memories
         WHERE session_id = ? AND checkpoint_turn_count = ?`,
      )
      .get(sessionId, checkpointTurnCount) as Record<string, unknown> | undefined;

    return row ? mapRowToTimelineMemory(row) : null;
  }

  deleteByCheckpoint(sessionId: string, checkpointTurnCount: number) {
    this.db
      .prepare(
        `DELETE FROM timeline_memories
         WHERE session_id = ? AND checkpoint_turn_count = ?`,
      )
      .run(sessionId, checkpointTurnCount);
  }

  close() {
    this.db.close();
  }

  private getById(id: string) {
    const row = this.db.prepare("SELECT * FROM timeline_memories WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? mapRowToTimelineMemory(row) : null;
  }

  private initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS timeline_memories (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        theme_title TEXT NOT NULL,
        theme_key TEXT NOT NULL,
        session_title_snapshot TEXT NOT NULL,
        memory_date TEXT NOT NULL,
        checkpoint_turn_count INTEGER NOT NULL,
        prompt_version TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL,
        source_thread_updated_at TEXT,
        generation_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(session_id, checkpoint_turn_count)
      );

      CREATE INDEX IF NOT EXISTS idx_timeline_memories_workspace_date
      ON timeline_memories (workspace_id, memory_date);

      CREATE INDEX IF NOT EXISTS idx_timeline_memories_session_created
      ON timeline_memories (session_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_timeline_memories_theme_created
      ON timeline_memories (theme_key, created_at DESC);
    `);
  }
}

function createThemeKey(sessionTitle: string) {
  return sessionTitle
    .trim()
    .replace(/^[【\[]+/, "")
    .replace(/[】\]]+$/, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function resolveDefaultMemoryDbPath() {
  const customPath = process.env.RELAY_MEMORY_DB_PATH;

  if (customPath) {
    return path.resolve(customPath);
  }

  if (process.env.VITEST) {
    return path.join(os.tmpdir(), `relay-memory-test-${process.pid}.db`);
  }

  return path.join(os.homedir(), ".codex", "sqlite", "relay-memory.db");
}

function mapRowToTimelineMemory(row: Record<string, unknown>): TimelineMemory {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    workspaceId: String(row.workspace_id),
    themeTitle: String(row.theme_title),
    themeKey: String(row.theme_key),
    sessionTitleSnapshot: String(row.session_title_snapshot),
    memoryDate: String(row.memory_date),
    checkpointTurnCount: Number(row.checkpoint_turn_count),
    promptVersion: String(row.prompt_version),
    title: String(row.title),
    content: String(row.content),
    status: row.status === "failed" ? "failed" : "completed",
    sourceThreadUpdatedAt: row.source_thread_updated_at ? String(row.source_thread_updated_at) : null,
    generationError: row.generation_error ? String(row.generation_error) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export { MemoryStore, createThemeKey, resolveDefaultMemoryDbPath };
