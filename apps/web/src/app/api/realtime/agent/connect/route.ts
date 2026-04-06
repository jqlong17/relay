import { readAgentAuthorization } from "@/lib/realtime/agent-auth";
import { claimRelayAgentRequest } from "@/lib/realtime/cloud-relay-store";

const textEncoder = new TextEncoder();
const KEEPALIVE_INTERVAL_MS = 15_000;
const REQUEST_POLL_INTERVAL_MS = 1_000;

function encodeSseChunk(chunk: string) {
  return textEncoder.encode(chunk);
}

export async function GET(request: Request) {
  const agent = await readAgentAuthorization(request);

  if (!agent) {
    return Response.json({ error: "Relay agent authorization is invalid." }, { status: 401 });
  }

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

      void (async () => {
        while (!closed && !request.signal.aborted) {
          try {
            const envelope = await claimRelayAgentRequest(agent.userId, agent.deviceId);

            if (envelope) {
              send(envelope);
              continue;
            }
          } catch (error) {
            try {
              controller.enqueue(encodeSseChunk(`: error ${(error as Error).message}\n\n`));
            } catch {
              cleanup();
              return;
            }
          }

          await new Promise((resolve) => {
            setTimeout(resolve, REQUEST_POLL_INTERVAL_MS);
          });
        }
      })();

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
