import { proxyBridge } from "../../../_lib";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return proxyBridge(`/sessions/${id}/memories`);
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const requestUrl = new URL(_request.url);
  return proxyBridge(`/sessions/${id}/memories/generate${requestUrl.search}`, {
    method: "POST",
  });
}
