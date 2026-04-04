import type { IncomingMessage, ServerResponse } from "node:http";

import { MemoryStore } from "@relay/memory-core";
import { TimelineMemoryService } from "../services/timeline-memory-service";

async function handleMemoriesRoute(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  memoryStore: MemoryStore,
  timelineMemoryService: TimelineMemoryService,
) {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && requestUrl.pathname.startsWith("/sessions/") && requestUrl.pathname.endsWith("/memories")) {
    const sessionId = requestUrl.pathname.replace("/sessions/", "").replace("/memories", "");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ items: memoryStore.listBySessionId(sessionId) }));
    return true;
  }

  if (
    request.method === "POST" &&
    requestUrl.pathname.startsWith("/sessions/") &&
    requestUrl.pathname.endsWith("/memories/generate")
  ) {
    const sessionId = requestUrl.pathname.replace("/sessions/", "").replace("/memories/generate", "");
    const force = requestUrl.searchParams.get("force") === "1";
    const item = await timelineMemoryService.generateForSession(sessionId, {
      force,
      manual: true,
    });

    response.writeHead(item ? 200 : 202, { "content-type": "application/json" });
    response.end(JSON.stringify({ item, ok: Boolean(item) }));
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/memories") {
    const sessionId = requestUrl.searchParams.get("sessionId");
    const memoryDate = requestUrl.searchParams.get("date");
    const themeKey = requestUrl.searchParams.get("themeKey");

    const items = sessionId
      ? memoryStore.listBySessionId(sessionId)
      : memoryDate
        ? memoryStore.listByDate(memoryDate)
        : themeKey
          ? memoryStore.listByThemeKey(themeKey)
          : memoryStore.listAll();

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ items }));
    return true;
  }

  return false;
}

export { handleMemoriesRoute };
