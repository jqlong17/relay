import { proxyBridge } from "../../_lib";

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

export async function DELETE(_: Request, context: RouteContext) {
  const { workspaceId } = await context.params;

  return proxyBridge(`/workspaces/${workspaceId}`, {
    method: "DELETE",
  });
}
