import { NextResponse } from "next/server";

import { deleteCodexAutomation, getCodexAutomation, updateCodexAutomation } from "../_lib";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const item = await getCodexAutomation(id);

  if (!item) {
    return NextResponse.json({ error: "Automation not found" }, { status: 404 });
  }

  return NextResponse.json({ item });
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      name: string;
      prompt: string;
      status: "ACTIVE" | "PAUSED";
      rrule: string;
      cwds: string[];
      model?: string | null;
      reasoningEffort?: string | null;
    };
    const item = await updateCodexAutomation(id, body);
    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update automation" },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const ok = await deleteCodexAutomation(id);

  if (!ok) {
    return NextResponse.json({ error: "Automation not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
