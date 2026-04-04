import { getBridgeBaseUrl } from "../../_lib";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const upstreamUrl = new URL("/files/tree", getBridgeBaseUrl());
  upstreamUrl.search = url.search;

  const response = await fetch(upstreamUrl, {
    cache: "no-store",
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
