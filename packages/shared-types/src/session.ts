import type { Message } from "./message";

type SessionSource = "fresh" | "snapshot";

type SessionSyncState = "idle" | "running" | "syncing" | "stale" | "broken";

type Session = {
  id: string;
  workspaceId: string;
  title: string;
  turnCount: number;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  cwd?: string;
  source?: SessionSource;
  syncState?: SessionSyncState;
  brokenReason?: string | null;
};

export type { Session, SessionSource, SessionSyncState };
