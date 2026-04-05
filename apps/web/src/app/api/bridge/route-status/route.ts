import { NextResponse } from "next/server";

import { resolveBridgeRouteStatus } from "@/lib/realtime/bridge-target";

export async function GET() {
  return NextResponse.json(await resolveBridgeRouteStatus());
}
