import { spawn } from "node:child_process";
import readline from "node:readline";

import { NextResponse } from "next/server";

import { computeNextRunAt, getCodexAutomation, listCodexAutomationRuns, recordCodexAutomationRun } from "../../_lib";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const automation = await getCodexAutomation(id);

  if (!automation) {
    return NextResponse.json({ error: "Automation not found" }, { status: 404 });
  }

  try {
    const result = await runAutomationNow({
      cwd: automation.cwds[0] ?? process.cwd(),
      prompt: automation.prompt,
    });
    const runAt = Date.now();
    const nextRunAt = computeNextRunAt(automation.rrule, runAt);
    await recordCodexAutomationRun({
      automationId: automation.id,
      title: automation.name,
      summary: summarizeText(result.output),
      output: result.output,
      prompt: automation.prompt,
      sourceCwd: automation.cwds[0] ?? null,
      runAt,
      nextRunAt,
    });

    return NextResponse.json({
      ok: true,
      output: result.output,
      summary: summarizeText(result.output),
      nextRunAt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run automation" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? "10");
  const items = await listCodexAutomationRuns(id, Number.isFinite(limit) ? limit : 10);
  const item = items[0] ?? null;

  return NextResponse.json({ item, items });
}

async function runAutomationNow(input: { cwd: string; prompt: string }) {
  const child = spawn(
    "codex",
    ["exec", "--json", "--skip-git-repo-check", "-C", input.cwd, input.prompt],
    {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let output = "";
  const stderrChunks: Buffer[] = [];

  child.stderr.on("data", (chunk) => {
    stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });

  const rl = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const event = parseJson(line);
    if (!event || event.type !== "item.completed" || !event.item || event.item.type !== "agent_message") {
      continue;
    }

    if (typeof event.item.text === "string") {
      output += event.item.text;
    }
  }

  const exitCode = await new Promise<number | null>((resolve) => {
    child.once("exit", (code) => resolve(code));
  });

  if (exitCode !== 0) {
    const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
    throw new Error(stderr || `codex exited with code ${exitCode}`);
  }

  return { output: output.trim() };
}

function parseJson(line: string): any {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function summarizeText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 180 ? `${normalized.slice(0, 180)}...` : normalized;
}
