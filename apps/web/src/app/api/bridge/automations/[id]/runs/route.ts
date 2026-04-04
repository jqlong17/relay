import { proxyBridge } from "../../../_lib";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const requestUrl = new URL(request.url);
  const limit = requestUrl.searchParams.get("limit");
  const search = limit ? `?limit=${encodeURIComponent(limit)}` : "";

  return proxyBridge(`/automations/${id}/runs${search}`);
}
