import type { RuntimeEvent } from "@relay/shared-types";

function parseRuntimeEvent(value: string): RuntimeEvent {
  return JSON.parse(value) as RuntimeEvent;
}

function applyRuntimeEvents(events: RuntimeEvent[]) {
  const messageBuffers = new Map<string, string>();
  const eventTypes: string[] = [];

  for (const event of events) {
    eventTypes.push(event.type);

    if (event.type === "message.delta") {
      const previous = messageBuffers.get(event.messageId) ?? "";
      messageBuffers.set(event.messageId, `${previous}${event.delta}`);
    }
  }

  return {
    eventTypes,
    messages: [...messageBuffers.entries()].map(([messageId, content]) => ({
      messageId,
      content,
    })),
  };
}

async function consumeRuntimeEventStream(
  response: Response,
  onEvent: (event: RuntimeEvent) => void,
) {
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

  if (!response.body) {
    throw new Error("Runtime stream body is missing");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed) {
        continue;
      }

      onEvent(parseRuntimeEvent(trimmed));
    }
  }

  const trailing = buffer.trim();
  if (trailing) {
    onEvent(parseRuntimeEvent(trailing));
  }
}

export { applyRuntimeEvents, consumeRuntimeEventStream, parseRuntimeEvent };
