import { proxyBridge } from "../../../_lib";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;

  return proxyBridge(`/automations/${id}/start`, {
    method: "POST",
  });
}
