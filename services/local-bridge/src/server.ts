import { createBridgeServer } from "./index";
import { CodexAppServerService } from "./services/codex-app-server";
import { WorkspaceStore } from "./services/workspace-store";

const port = Number(process.env.RELAY_LOCAL_BRIDGE_PORT ?? 4242);
const host = process.env.RELAY_LOCAL_BRIDGE_HOST ?? "127.0.0.1";
const workspaceStore = new WorkspaceStore();
const codexAppServerService = new CodexAppServerService();

const server = createBridgeServer({
  codexAppServerService,
  workspaceStore,
});

server.listen(port, host, () => {
  console.log(`relay local bridge listening on http://${host}:${port}`);
  void warmBridge(codexAppServerService, workspaceStore);
});

async function warmBridge(codexAppServerService: CodexAppServerService, workspaceStore: WorkspaceStore) {
  try {
    await codexAppServerService.warm();

    const activeWorkspace = workspaceStore.getActive();
    if (activeWorkspace) {
      void codexAppServerService.threadList({ cwd: activeWorkspace.localPath }).catch(() => {});
    }
  } catch (error) {
    console.error("Failed to warm codex app server", error);
  }
}
