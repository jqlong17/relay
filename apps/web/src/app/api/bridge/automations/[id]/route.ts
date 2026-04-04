import { proxyBridge } from "../../_lib";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.text();

  return proxyBridge(`/automations/${id}`, {
    method: "PATCH",
    body,
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;

  return proxyBridge(`/automations/${id}`, {
    method: "DELETE",
  });
}
