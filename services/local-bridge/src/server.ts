import { createBridgeServer } from "./index";
import { CloudRelayRealtimeService } from "./services/cloud-relay-realtime-service";
import { CodexAppServerService } from "./services/codex-app-server";
import { DevicePresenceService } from "./services/device-presence-service";
import { LocalDeviceService } from "./services/local-device-service";
import { RelayStateStore } from "./services/relay-state-store";
import { WorkspaceStore } from "./services/workspace-store";

const port = Number(process.env.RELAY_LOCAL_BRIDGE_PORT ?? 4242);
const host = process.env.RELAY_LOCAL_BRIDGE_HOST ?? "127.0.0.1";
const relayStateStore = new RelayStateStore();
const workspaceStore = new WorkspaceStore(relayStateStore);
const codexAppServerService = new CodexAppServerService();
const localDeviceService = new LocalDeviceService(relayStateStore);
const devicePresenceService = new DevicePresenceService({
  localDeviceService,
});
const cloudRelayRealtimeService = new CloudRelayRealtimeService({
  localDeviceService,
});

const server = createBridgeServer({
  codexAppServerService,
  localDeviceService,
  relayStateStore,
  workspaceStore,
});

server.listen(port, host, () => {
  console.log(`relay local bridge listening on http://${host}:${port}`);
  void warmBridge(codexAppServerService, workspaceStore);
  devicePresenceService.start();
  cloudRelayRealtimeService.start();
});

server.on("close", () => {
  devicePresenceService.stop();
  void cloudRelayRealtimeService.stop();
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
