import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";

type AppServerThread = {
  id: string;
  preview: string;
  createdAt: number;
  updatedAt: number;
  cwd: string;
  name: string | null;
  turns: AppServerTurn[];
};

type AppServerTurn = {
  id: string;
  items: AppServerItem[];
  status: "inProgress" | "completed" | "interrupted" | "failed";
  error: { message?: string } | null;
};

type AppServerItem =
  | {
      type: "userMessage";
      id: string;
      content: AppServerUserInput[];
    }
  | {
      type: "agentMessage";
      id: string;
      text: string;
    }
  | {
      type: string;
      id: string;
    };

type AppServerUserInput =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image";
      url: string;
    }
  | {
      type: "localImage";
      path: string;
    };

type AppServerNotification = {
  method: string;
  params?: Record<string, unknown>;
};

type AppServerRequestHandlers = {
  threadList?: (params: { cwd: string }) => Promise<AppServerThread[]>;
  threadStart?: (params: { cwd: string }) => Promise<AppServerThread>;
  threadRead?: (threadId: string, includeTurns: boolean) => Promise<AppServerThread>;
  threadResume?: (threadId: string) => Promise<AppServerThread>;
  threadArchive?: (threadId: string) => Promise<void>;
  threadSetName?: (threadId: string, name: string) => Promise<void>;
  startTurnStream?: (
    threadId: string,
    input: AppServerUserInput[],
  ) => Promise<{ turnId: string; notifications: AsyncIterable<AppServerNotification> }>;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

class CodexAppServerService {
  private child: ChildProcessWithoutNullStreams | null = null;
  private lineReader: readline.Interface | null = null;
  private initializedPromise: Promise<void> | null = null;
  private readonly pendingRequests = new Map<number, PendingRequest>();
  private readonly notificationListeners = new Set<(notification: AppServerNotification) => void>();
  private nextRequestId = 1;

  constructor(private readonly handlers: AppServerRequestHandlers = {}) {}

  async warm() {
    await this.ensureInitialized();
  }

  async threadList(params: { cwd: string }) {
    if (this.handlers.threadList) {
      return this.handlers.threadList(params);
    }

    const result = (await this.request("thread/list", params)) as { data: AppServerThread[] };
    return result.data;
  }

  async threadStart(params: { cwd: string }) {
    if (this.handlers.threadStart) {
      return this.handlers.threadStart(params);
    }

    const result = (await this.request("thread/start", {
      cwd: params.cwd,
      approvalPolicy: "never",
      sandbox: "workspace-write",
    })) as { thread: AppServerThread };
    return result.thread;
  }

  async threadRead(threadId: string, includeTurns = false) {
    if (this.handlers.threadRead) {
      return this.handlers.threadRead(threadId, includeTurns);
    }

    const result = (await this.request("thread/read", {
      threadId,
      includeTurns,
    })) as { thread: AppServerThread };
    return result.thread;
  }

  async threadResume(threadId: string) {
    if (this.handlers.threadResume) {
      return this.handlers.threadResume(threadId);
    }

    const result = (await this.request("thread/resume", {
      threadId,
      approvalPolicy: "never",
      sandbox: "workspace-write",
    })) as { thread: AppServerThread };
    return result.thread;
  }

  async threadArchive(threadId: string) {
    if (this.handlers.threadArchive) {
      return this.handlers.threadArchive(threadId);
    }

    await this.request("thread/archive", { threadId });
  }

  async threadSetName(threadId: string, name: string) {
    if (this.handlers.threadSetName) {
      return this.handlers.threadSetName(threadId, name);
    }

    await this.request("thread/name/set", { threadId, name });
  }

  async startTurnStream(threadId: string, input: AppServerUserInput[]) {
    if (this.handlers.startTurnStream) {
      return this.handlers.startTurnStream(threadId, input);
    }

    await this.ensureInitialized();
    try {
      await this.threadResume(threadId);
    } catch (error) {
      if (!isMissingRolloutError(error)) {
        throw error;
      }
    }
    const queue = new AsyncNotificationQueue<AppServerNotification>();
    let activeTurnId: string | null = null;

    const unsubscribe = this.onNotification((notification) => {
      if (!belongsToThread(notification, threadId)) {
        return;
      }

      const notificationTurnId = getNotificationTurnId(notification);
      if (activeTurnId && notificationTurnId && notificationTurnId !== activeTurnId) {
        return;
      }

      queue.push(notification);

      if (
        notification.method === "turn/completed" &&
        notification.params &&
        typeof notification.params === "object" &&
        "turn" in notification.params
      ) {
        queue.close();
        unsubscribe();
      }
    });

    try {
      const result = (await this.request("turn/start", {
        threadId,
        input,
      })) as { turn: AppServerTurn };
      activeTurnId = result.turn.id;
      return { turnId: activeTurnId, notifications: queue };
    } catch (error) {
      queue.close();
      unsubscribe();
      throw error;
    }
  }

  private async ensureInitialized() {
    if (this.handlers.threadList || this.handlers.threadStart || this.handlers.startTurnStream) {
      return;
    }

    if (!this.initializedPromise) {
      this.initializedPromise = this.startAndInitialize();
    }

    return this.initializedPromise;
  }

  private async startAndInitialize() {
    this.child = spawn("codex", ["app-server", "--listen", "stdio://"], {
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.child.once("error", (error) => {
      for (const request of this.pendingRequests.values()) {
        request.reject(error);
      }
      this.pendingRequests.clear();
    });

    this.lineReader = readline.createInterface({
      input: this.child.stdout,
      crlfDelay: Infinity,
    });

    void (async () => {
      for await (const line of this.lineReader ?? []) {
        this.handleLine(line);
      }
    })();

    await this.requestRaw("initialize", {
      clientInfo: {
        name: "relay_web_cli",
        title: "Relay Web CLI",
        version: "0.0.1",
      },
    });
    this.send({ method: "initialized", params: {} });
  }

  private async request(method: string, params?: Record<string, unknown>) {
    await this.ensureInitialized();
    return this.requestRaw(method, params);
  }

  private async requestRaw(method: string, params?: Record<string, unknown>) {
    const id = this.nextRequestId++;

    return new Promise<unknown>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.send({ id, method, params });
    });
  }

  private send(message: Record<string, unknown>) {
    if (!this.child?.stdin) {
      throw new Error("codex app-server stdin is unavailable");
    }

    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string) {
    const payload = JSON.parse(line) as {
      id?: number;
      result?: unknown;
      error?: { message?: string };
      method?: string;
      params?: Record<string, unknown>;
    };

    if (typeof payload.id === "number") {
      const pending = this.pendingRequests.get(payload.id);

      if (!pending) {
        return;
      }

      this.pendingRequests.delete(payload.id);

      if (payload.error) {
        pending.reject(new Error(payload.error.message ?? "App server request failed"));
        return;
      }

      pending.resolve(payload.result);
      return;
    }

    if (payload.method) {
      const notification: AppServerNotification = {
        method: payload.method,
        params: payload.params,
      };

      for (const listener of this.notificationListeners) {
        listener(notification);
      }
    }
  }

  private onNotification(listener: (notification: AppServerNotification) => void) {
    this.notificationListeners.add(listener);
    return () => {
      this.notificationListeners.delete(listener);
    };
  }
}

function isMissingRolloutError(error: unknown) {
  return error instanceof Error && error.message.includes("no rollout found for thread id");
}

class AsyncNotificationQueue<T> implements AsyncIterable<T> {
  private readonly items: T[] = [];
  private readonly resolvers: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  push(item: T) {
    const resolver = this.resolvers.shift();

    if (resolver) {
      resolver({ value: item, done: false });
      return;
    }

    this.items.push(item);
  }

  close() {
    this.closed = true;

    while (this.resolvers.length > 0) {
      const resolver = this.resolvers.shift();
      resolver?.({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator]() {
    return {
      next: () => {
        const item = this.items.shift();

        if (item !== undefined) {
          return Promise.resolve({ value: item, done: false });
        }

        if (this.closed) {
          return Promise.resolve({ value: undefined, done: true });
        }

        return new Promise<IteratorResult<T>>((resolve) => {
          this.resolvers.push(resolve);
        });
      },
    };
  }
}

function belongsToThread(notification: AppServerNotification, threadId: string) {
  if (!notification.params) {
    return false;
  }

  if (notification.params.threadId === threadId) {
    return true;
  }

  if (
    "thread" in notification.params &&
    notification.params.thread &&
    typeof notification.params.thread === "object" &&
    "id" in notification.params.thread
  ) {
    return notification.params.thread.id === threadId;
  }

  return false;
}

function getNotificationTurnId(notification: AppServerNotification) {
  if (!notification.params) {
    return null;
  }

  if (typeof notification.params.turnId === "string") {
    return notification.params.turnId;
  }

  if (
    "turn" in notification.params &&
    notification.params.turn &&
    typeof notification.params.turn === "object" &&
    "id" in notification.params.turn
  ) {
    return typeof notification.params.turn.id === "string" ? notification.params.turn.id : null;
  }

  return null;
}

export { CodexAppServerService };
export type {
  AppServerItem,
  AppServerNotification,
  AppServerRequestHandlers,
  AppServerThread,
  AppServerTurn,
  AppServerUserInput,
};
