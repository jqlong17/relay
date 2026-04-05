import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import { defaultUserUiToml, getUiCssVariables, parseUserUiConfigText, resolveUiConfig } from "@/config/ui.config";

function getConfigPath() {
  return path.join(process.cwd(), "..", "..", "relay.ui.toml");
}

function buildUiConfigResponse(content: string) {
  const uiConfig = resolveUiConfig(parseUserUiConfigText(content));
  return {
    content,
    uiConfig,
    cssVariables: getUiCssVariables(uiConfig),
  };
}

export async function GET() {
  try {
    const content = await fs.readFile(getConfigPath(), "utf8");
    return NextResponse.json(buildUiConfigResponse(content));
  } catch (error) {
    console.error("Failed to read relay.ui.toml", error);
    return NextResponse.json({ error: "Failed to read config" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { content?: string; reset?: boolean };

    if (body.reset) {
      await fs.writeFile(getConfigPath(), defaultUserUiToml, "utf8");
      return NextResponse.json({ ok: true, ...buildUiConfigResponse(defaultUserUiToml) });
    }

    if (typeof body.content !== "string") {
      return NextResponse.json({ error: "Invalid config content" }, { status: 400 });
    }

    await fs.writeFile(getConfigPath(), body.content, "utf8");
    return NextResponse.json({ ok: true, ...buildUiConfigResponse(body.content) });
  } catch (error) {
    console.error("Failed to write relay.ui.toml", error);
    return NextResponse.json({ error: "Failed to save config" }, { status: 500 });
  }
}
