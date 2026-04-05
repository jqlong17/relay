const fs = require("node:fs");
const path = require("node:path");

const rootDir = "/Users/ruska/project/web-cli";
const envFile = path.join(rootDir, ".env.local");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, "utf8");
  const entries = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!key) {
      continue;
    }

    entries[key] = value;
  }

  return entries;
}

const localEnv = loadEnvFile(envFile);

module.exports = {
  apps: [
    {
      name: "relay-bridge",
      cwd: rootDir,
      script: "pnpm",
      args: "--filter local-bridge dev",
      env: {
        NODE_ENV: "development",
        ...localEnv,
      },
      autorestart: true,
      watch: false,
      max_restarts: 20,
      restart_delay: 500,
    },
    {
      name: "relay-web",
      cwd: rootDir,
      script: "pnpm",
      args: "--filter web dev",
      env: {
        NODE_ENV: "development",
        ...localEnv,
      },
      autorestart: true,
      watch: false,
      max_restarts: 20,
      restart_delay: 500,
    },
  ],
};
