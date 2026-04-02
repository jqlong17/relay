import { proxyBridge } from "../../_lib";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return proxyBridge(`/sessions/${id}`);
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const requestUrl = new URL(request.url);
  const action = requestUrl.searchParams.get("action");

  if (action === "archive") {
    return proxyBridge(`/sessions/${id}/archive`, {
      method: "POST",
    });
  }

  if (action === "rename") {
    const body = await request.text();

    return proxyBridge(`/sessions/${id}/rename`, {
      method: "POST",
      body,
    });
  }

  return new Response(JSON.stringify({ error: "Not Found" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}
