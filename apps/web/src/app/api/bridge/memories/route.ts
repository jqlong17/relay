import { proxyBridge } from "../_lib";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const search = requestUrl.search;
  return proxyBridge(`/memories${search}`);
}
