type RuntimeEvent =
  | { type: "run.started"; runId: string; sessionId: string; createdAt: string }
  | { type: "message.delta"; runId: string; messageId: string; delta: string; createdAt: string }
  | { type: "message.completed"; runId: string; messageId: string; createdAt: string }
  | { type: "run.completed"; runId: string; sessionId: string; createdAt: string }
  | { type: "run.failed"; runId: string; sessionId: string; error: string; createdAt: string };

export type { RuntimeEvent };
