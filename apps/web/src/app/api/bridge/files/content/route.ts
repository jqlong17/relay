import { proxyBridge } from "../../_lib";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filePath = url.searchParams.get("path");
  const encodedPath = filePath ? encodeURIComponent(filePath) : "";

  return proxyBridge(`/files/content?path=${encodedPath}`);
}
