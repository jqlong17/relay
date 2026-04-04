import { proxyBridge } from "../_lib";

export async function GET() {
  return proxyBridge("/automations");
}

export async function POST(request: Request) {
  const body = await request.text();

  return proxyBridge("/automations", {
    method: "POST",
    body,
  });
}
