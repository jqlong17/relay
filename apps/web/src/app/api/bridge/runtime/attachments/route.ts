import { proxyBridge } from "../../_lib";

export async function POST(request: Request) {
  return proxyBridge("/runtime/attachments", {
    method: "POST",
    body: await request.text(),
  });
}
