import { proxyBridge } from "../../_lib";

export async function POST(request: Request) {
  const body = await request.text();

  return proxyBridge("/device/bind", {
    method: "POST",
    body,
  });
}
