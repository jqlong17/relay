import { proxyBridge } from "../_lib";

export async function GET() {
  return proxyBridge("/workspaces");
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const mode = requestUrl.searchParams.get("mode");

  if (mode === "picker") {
    return proxyBridge("/workspaces/open-picker", {
      method: "POST",
    });
  }

  const body = await request.text();
  return proxyBridge("/workspaces/open", {
    method: "POST",
    body,
  });
}
