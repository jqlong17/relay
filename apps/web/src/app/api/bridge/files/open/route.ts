import { proxyBridge } from "../../_lib";

export async function POST(request: Request) {
  const body = await request.text();

  return proxyBridge("/files/open-in-finder", {
    method: "POST",
    body,
  });
}
