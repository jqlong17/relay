import { createBridgeServer } from "./index";
import { CodexAppServerService } from "./services/codex-app-server";

const port = Number(process.env.RELAY_LOCAL_BRIDGE_PORT ?? 4242);
const host = process.env.RELAY_LOCAL_BRIDGE_HOST ?? "127.0.0.1";

const server = createBridgeServer({
  codexAppServerService: new CodexAppServerService(),
});

server.listen(port, host, () => {
  console.log(`relay local bridge listening on http://${host}:${port}`);
});
