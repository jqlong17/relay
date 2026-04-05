import { readAgentAuthorization } from "@/lib/realtime/agent-auth";
import { getRelayHub } from "@/lib/realtime/relay-hub";

const textEncoder = new TextEncoder();
const KEEPALIVE_INTERVAL_MS = 15_000;

function encodeSseChunk(chunk: string) {
  return textEncoder.encode(chunk);
}

export async function GET(request: Request) {
  const agent = await readAgentAuthorization(request);

  if (!agent) {
    return Response.json({ error: "Relay agent authorization is invalid." }, { status: 401 });
  }

  const relayHub = getRelayHub();
  const connectionId = crypto.randomUUID();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      cleanup = () => {
        if (closed) {
          return;
        }

        closed = true;
        clearInterval(keepaliveTimer);
        relayHub.unregisterAgent(agent.deviceId, connectionId);

        try {
          controller.close();
        } catch {}
      };

      const send = (event: unknown) => {
        if (closed) {
          return;
        }

        try {
          controller.enqueue(encodeSseChunk(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          cleanup();
        }
      };

      relayHub.registerAgent({
        connectionId,
        connectedAt: new Date().toISOString(),
        deviceId: agent.deviceId,
        send,
        userId: agent.userId,
      });

      controller.enqueue(encodeSseChunk(": connected\n\n"));

      const keepaliveTimer = setInterval(() => {
        if (closed) {
          return;
        }

        try {
          controller.enqueue(encodeSseChunk(`: keepalive ${Date.now()}\n\n`));
        } catch {
          cleanup();
        }
      }, KEEPALIVE_INTERVAL_MS);

      request.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
    },
  });
}
