type RuntimeEvent =
  | { type: "run.started"; runId: string; sessionId: string; createdAt: string }
  | { type: "message.delta"; runId: string; messageId: string; delta: string; createdAt: string }
  | {
      type: "process.delta";
      runId: string;
      itemId: string;
      phase: "thinking" | "plan" | "command";
      delta: string;
      createdAt: string;
    }
  | {
      type: "process.started";
      runId: string;
      itemId: string;
      phase: "thinking" | "plan" | "command";
      label?: string;
      createdAt: string;
    }
  | {
      type: "process.completed";
      runId: string;
      itemId: string;
      phase: "thinking" | "plan" | "command";
      createdAt: string;
    }
  | { type: "message.completed"; runId: string; messageId: string; createdAt: string }
  | { type: "run.completed"; runId: string; sessionId: string; createdAt: string }
  | { type: "run.failed"; runId: string; sessionId: string; error: string; createdAt: string }
  | { type: "thread.updated"; sessionId: string; workspaceId?: string | null; createdAt: string }
  | { type: "thread.list.changed"; sessionId?: string; workspaceId?: string | null; createdAt: string }
  | { type: "thread.broken"; sessionId: string; reason: string; createdAt: string }
  | { type: "thread.deleted_or_missing"; sessionId: string; workspaceId?: string | null; createdAt: string };

export type { RuntimeEvent };
