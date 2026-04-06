import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

import { readRelayEnv } from "./tests/e2e/support/relay-env";

const relayEnv = readRelayEnv();
const repoRoot = path.resolve(__dirname, "../..");
const port = 3000;
const baseURL = `http://127.0.0.1:${port}`;
const useProductionServer = process.env.RELAY_E2E_USE_PRODUCTION === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "webkit-mobile",
      use: {
        ...devices["iPhone 13"],
        browserName: "webkit",
      },
    },
  ],
  webServer: {
    command: useProductionServer
      ? `pnpm --filter web exec next start --hostname 127.0.0.1 --port ${port}`
      : `pnpm --filter web exec next dev --port ${port}`,
    cwd: repoRoot,
    env: {
      ...process.env,
      ...relayEnv,
    },
    reuseExistingServer: true,
    timeout: 120_000,
    url: `${baseURL}/login?next=%2Fmobile`,
  },
});
