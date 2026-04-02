import { proxyBridge } from "../_lib";

export async function GET() {
  return proxyBridge("/sessions");
}

export async function POST(request: Request) {
  const body = await request.text();
  return proxyBridge("/sessions", {
    method: "POST",
    body,
  });
}
