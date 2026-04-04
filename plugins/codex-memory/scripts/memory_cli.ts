import fs from "node:fs";

import {
  buildMemoryInjectionContext,
  createThemeKey,
  MemoryStore,
  searchMemories,
} from "../../../packages/memory-core/src/index.ts";

type CommandName = "search" | "inject" | "save-timeline";

type ParsedArgs = {
  command: CommandName;
  values: Record<string, string | boolean>;
};

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const memoryStore = new MemoryStore();

  try {
    switch (parsed.command) {
      case "search":
        writeJson(
          searchMemories(memoryStore, {
            query: getString(parsed.values, "query"),
            sessionId: getString(parsed.values, "session-id"),
            themeKey: normalizeThemeKey(getString(parsed.values, "theme-key")),
            date: getString(parsed.values, "date"),
            limit: getNumber(parsed.values, "limit"),
          }),
        );
        break;
      case "inject": {
        const memories = searchMemories(memoryStore, {
          query: getString(parsed.values, "query"),
          sessionId: getString(parsed.values, "session-id"),
          themeKey: normalizeThemeKey(getString(parsed.values, "theme-key")),
          date: getString(parsed.values, "date"),
          limit: getNumber(parsed.values, "limit") ?? 5,
        });
        writeJson(
          buildMemoryInjectionContext(memories, {
            maxItems: getNumber(parsed.values, "max-items"),
            maxChars: getNumber(parsed.values, "max-chars"),
          }),
        );
        break;
      }
      case "save-timeline": {
        const sessionId = requiredString(parsed.values, "session-id");
        const workspaceId = requiredString(parsed.values, "workspace-id");
        const themeTitle = requiredString(parsed.values, "theme-title");
        const checkpointTurnCount = requiredNumber(parsed.values, "checkpoint-turn-count");
        const content = readContent(parsed.values);

        if (parsed.values.force === true) {
          memoryStore.deleteByCheckpoint(sessionId, checkpointTurnCount);
        }

        const item = memoryStore.create({
          sessionId,
          workspaceId,
          themeTitle,
          themeKey: createThemeKey(themeTitle),
          sessionTitleSnapshot: getString(parsed.values, "session-title-snapshot") ?? themeTitle,
          memoryDate: getString(parsed.values, "memory-date") ?? new Date().toISOString().slice(0, 10),
          checkpointTurnCount,
          promptVersion: getString(parsed.values, "prompt-version") ?? "timeline-memory/v1",
          title: getString(parsed.values, "title") ?? `${themeTitle} · ${checkpointTurnCount}轮时间线记忆`,
          content,
          status: "completed",
          sourceThreadUpdatedAt: getString(parsed.values, "source-thread-updated-at") ?? null,
        });

        writeJson({ ok: true, item });
        break;
      }
      default:
        throw new Error(`Unsupported command: ${parsed.command satisfies never}`);
    }
  } finally {
    memoryStore.close();
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const [commandRaw, ...rest] = argv;

  if (commandRaw !== "search" && commandRaw !== "inject" && commandRaw !== "save-timeline") {
    throw new Error("Usage: memory_cli.ts <search|inject|save-timeline> [--key value]");
  }

  const values: Record<string, string | boolean> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token?.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = rest[index + 1];

    if (!next || next.startsWith("--")) {
      values[key] = true;
      continue;
    }

    values[key] = next;
    index += 1;
  }

  return { command: commandRaw, values };
}

function requiredString(values: Record<string, string | boolean>, key: string) {
  const value = getString(values, key);

  if (!value) {
    throw new Error(`Missing required argument --${key}`);
  }

  return value;
}

function requiredNumber(values: Record<string, string | boolean>, key: string) {
  const value = getNumber(values, key);

  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Missing required numeric argument --${key}`);
  }

  return value;
}

function getString(values: Record<string, string | boolean>, key: string) {
  const value = values[key];
  return typeof value === "string" ? value : undefined;
}

function getNumber(values: Record<string, string | boolean>, key: string) {
  const value = getString(values, key);
  return value ? Number(value) : undefined;
}

function normalizeThemeKey(value: string | undefined) {
  return value ? createThemeKey(value) : undefined;
}

function readContent(values: Record<string, string | boolean>) {
  const contentFile = getString(values, "content-file");
  const content = getString(values, "content");

  if (contentFile) {
    return fs.readFileSync(contentFile, "utf8").trim();
  }

  if (content) {
    return content.trim();
  }

  const stdin = fs.readFileSync(0, "utf8").trim();
  if (stdin) {
    return stdin;
  }

  throw new Error("Missing memory content. Use --content, --content-file, or pipe stdin.");
}

function writeJson(payload: unknown) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main();
