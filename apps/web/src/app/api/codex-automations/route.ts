import { NextResponse } from "next/server";

import { createCodexAutomation, listCodexAutomations } from "./_lib";

export async function GET() {
  return NextResponse.json({ items: await listCodexAutomations() });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name: string;
      prompt: string;
      status: "ACTIVE" | "PAUSED";
      rrule: string;
      cwds: string[];
      model?: string | null;
      reasoningEffort?: string | null;
    };
    const item = await createCodexAutomation(body);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create automation" },
      { status: 400 },
    );
  }
}
