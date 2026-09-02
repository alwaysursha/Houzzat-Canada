import { NextResponse } from "next/server";
import { requireAgentContextFromRequest } from "@/lib/agent";
import { loadLaunchpadPayload } from "@/lib/agent/launchpad-payload";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ctx = await requireAgentContextFromRequest(request);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await loadLaunchpadPayload(ctx);
  return NextResponse.json({ ok: true, ...payload });
}
