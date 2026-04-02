import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import readline from "node:readline";

import type { RuntimeEvent } from "@relay/shared-types";

type CodexRunInput = {
  sessionId: string;
  prompt: string;
  workingDirectory: string;
};

type CodexExecutor = (input: CodexRunInput) => AsyncIterable<RuntimeEvent>;

type CodexJsonEvent =
  | { type: "thread.started"; thread_id: string }
  | { type: "turn.started" }
  | { type: "turn.completed"; usage: unknown }
  | { type: "turn.failed"; error?: { message?: string } }
  | { type: "item.completed"; item: { id: string; type: string; text?: string; aggregated_output?: string } }
  | { type: "error"; message: string };

class CodexCliService {
  constructor(private readonly executor: CodexExecutor = createMockExecutor()) {}

  runStream(input: CodexRunInput) {
    return this.executor(input);
  }

  async run(input: CodexRunInput) {
    const events: RuntimeEvent[] = [];

    for await (const event of this.runStream(input)) {
      events.push(event);
    }

    return events;
  }

  static createReal() {
    return new CodexCliService(runRealCodexExec);
  }
}

function createMockExecutor(): CodexExecutor {
  return async function* (input) {
    const now = new Date().toISOString();
    const runId = randomUUID();
    const messageId = randomUUID();

    yield { type: "run.started", runId, sessionId: input.sessionId, createdAt: now };
    yield {
      type: "message.delta",
      runId,
      messageId,
      delta: `relay local bridge received: ${input.prompt}`,
      createdAt: now,
    };
    yield { type: "message.completed", runId, messageId, createdAt: now };
    yield { type: "run.completed", runId, sessionId: input.sessionId, createdAt: now };
  };
}

async function* runRealCodexExec(input: CodexRunInput): AsyncIterable<RuntimeEvent> {
  const runId = randomUUID();
  const child = spawn(
    "codex",
    [
      "exec",
      "--json",
      "--skip-git-repo-check",
      "-C",
      input.workingDirectory,
      input.prompt,
    ],
    {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const stderrChunks: Buffer[] = [];
  let childProcessError: Error | null = null;
  if (child.stderr) {
    child.stderr.on("data", (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
  }
  child.once("error", (error) => {
    childProcessError = error;
  });

  const now = new Date().toISOString();
  yield { type: "run.started", runId, sessionId: input.sessionId, createdAt: now };

  if (!child.stdout) {
    yield {
      type: "run.failed",
      runId,
      sessionId: input.sessionId,
      error: "codex process has no stdout",
      createdAt: new Date().toISOString(),
    };
    return;
  }

  const rl = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity,
  });
  let sawRunTerminalEvent = false;

  try {
    for await (const line of rl) {
      const event = parseCodexJsonLine(line);

      if (!event) {
        continue;
      }

      const mappedEvents = mapCodexEventToRuntimeEvents(event, runId, input.sessionId);
      for (const mappedEvent of mappedEvents) {
        if (mappedEvent.type === "run.completed" || mappedEvent.type === "run.failed") {
          sawRunTerminalEvent = true;
        }

        yield mappedEvent;
      }
    }
  } finally {
    rl.close();
  }

  const exitResult = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve) => {
      child.once("exit", (code, signal) => resolve({ code, signal }));
    },
  );

  if (childProcessError) {
    yield {
      type: "run.failed",
      runId,
      sessionId: input.sessionId,
      error: childProcessError.message,
      createdAt: new Date().toISOString(),
    };
    return;
  }

  if (exitResult.code !== 0 || exitResult.signal) {
    const stderrOutput = Buffer.concat(stderrChunks).toString("utf8").trim();
    yield {
      type: "run.failed",
      runId,
      sessionId: input.sessionId,
      error: stderrOutput || `codex exited with ${exitResult.signal ?? exitResult.code}`,
      createdAt: new Date().toISOString(),
    };
    return;
  }

  if (!sawRunTerminalEvent) {
    yield {
      type: "run.completed",
      runId,
      sessionId: input.sessionId,
      createdAt: new Date().toISOString(),
    };
  }
}

function parseCodexJsonLine(line: string): CodexJsonEvent | null {
  const trimmed = line.trim();

  if (!trimmed.startsWith("{")) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as CodexJsonEvent;
  } catch {
    return null;
  }
}

function mapCodexEventToRuntimeEvents(
  event: CodexJsonEvent,
  runId: string,
  sessionId: string,
): RuntimeEvent[] {
  const createdAt = new Date().toISOString();

  if (event.type === "item.completed" && event.item.type === "agent_message" && event.item.text) {
    const messageId = event.item.id || randomUUID();
    return [
      {
        type: "message.delta",
        runId,
        messageId,
        delta: event.item.text,
        createdAt,
      },
      {
        type: "message.completed",
        runId,
        messageId,
        createdAt,
      },
    ];
  }

  if (event.type === "turn.completed") {
    return [{ type: "run.completed", runId, sessionId, createdAt }];
  }

  if (event.type === "turn.failed") {
    return [
      {
        type: "run.failed",
        runId,
        sessionId,
        error: event.error?.message ?? "Codex turn failed",
        createdAt,
      },
    ];
  }

  if (event.type === "error") {
    return [
      {
        type: "run.failed",
        runId,
        sessionId,
        error: event.message,
        createdAt,
      },
    ];
  }

  return [];
}

export { CodexCliService, mapCodexEventToRuntimeEvents, parseCodexJsonLine };
export type { CodexExecutor, CodexRunInput, CodexJsonEvent };
