import type { RuntimeEvent } from "@relay/shared-types";

type ThreadUpdatedEvent = {
  type: "thread.updated";
  sessionId: string;
  workspaceId: string | null;
  createdAt: string;
};

type ThreadListChangedEvent = {
  type: "thread.list.changed";
  sessionId: string;
  workspaceId: string | null;
  createdAt: string;
};

type ThreadBrokenEvent = {
  type: "thread.broken";
  sessionId: string;
  reason: string;
  createdAt: string;
};

type ThreadDeletedOrMissingEvent = {
  type: "thread.deleted_or_missing";
  sessionId: string;
  createdAt: string;
};

type RuntimeBridgeEvent =
  | RuntimeEvent
  | ThreadUpdatedEvent
  | ThreadListChangedEvent
  | ThreadBrokenEvent
  | ThreadDeletedOrMissingEvent;

type RuntimeEventListener = (event: RuntimeBridgeEvent) => void;

type RuntimeEventSubscriptionFilter = {
  sessionId?: string;
  workspaceId?: string;
};

class RuntimeEventBus {
  private nextListenerId = 1;
  private readonly runToSessionId = new Map<string, string>();

  private readonly listeners = new Map<
    number,
    {
      listener: RuntimeEventListener;
      filter: RuntimeEventSubscriptionFilter;
    }
  >();

  subscribe(listener: RuntimeEventListener, filter: RuntimeEventSubscriptionFilter = {}) {
    const listenerId = this.nextListenerId;
    this.nextListenerId += 1;

    this.listeners.set(listenerId, { listener, filter });

    return () => {
      this.listeners.delete(listenerId);
    };
  }

  publish(event: RuntimeBridgeEvent) {
    if (event.type === "run.started") {
      this.runToSessionId.set(event.runId, event.sessionId);
    }

    if (event.type === "run.completed" || event.type === "run.failed") {
      this.runToSessionId.delete(event.runId);
    }

    for (const subscription of this.listeners.values()) {
      if (
        subscription.filter.sessionId &&
        this.getEventSessionId(event) !== subscription.filter.sessionId
      ) {
        continue;
      }

      if (
        subscription.filter.workspaceId &&
        this.getEventWorkspaceId(event) !== subscription.filter.workspaceId
      ) {
        continue;
      }

      subscription.listener(event);
    }
  }

  private getEventSessionId(event: RuntimeBridgeEvent) {
    if ("sessionId" in event) {
      return event.sessionId;
    }

    if ("runId" in event) {
      return this.runToSessionId.get(event.runId) ?? null;
    }

    return null;
  }

  private getEventWorkspaceId(event: RuntimeBridgeEvent) {
    if ("workspaceId" in event) {
      return event.workspaceId ?? null;
    }

    return null;
  }
}

export { RuntimeEventBus };
export type { RuntimeBridgeEvent };
