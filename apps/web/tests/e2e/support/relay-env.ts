import fs from "node:fs";
import path from "node:path";

function parseEnvFile(content: string) {
  const values: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key) {
      values[key] = value;
    }
  }

  return values;
}

export function readRelayEnv() {
  const candidatePaths = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), "../../.env.local"),
  ];
  const repoEnvPath = candidatePaths.find((candidatePath) => fs.existsSync(candidatePath));
  const fileValues = repoEnvPath ? parseEnvFile(fs.readFileSync(repoEnvPath, "utf8")) : {};

  return {
    RELAY_ACCESS_PASSWORD: process.env.RELAY_ACCESS_PASSWORD ?? fileValues.RELAY_ACCESS_PASSWORD ?? "",
    RELAY_SESSION_SECRET: process.env.RELAY_SESSION_SECRET ?? fileValues.RELAY_SESSION_SECRET ?? "",
  };
}
