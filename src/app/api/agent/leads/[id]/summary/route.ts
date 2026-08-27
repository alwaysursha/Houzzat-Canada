import { NextResponse } from "next/server";
import { requireAgentContextFromRequest } from "@/lib/agent";
import { loadLeadSummary } from "@/lib/agent/lead-summary";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const ctx = await requireAgentContextFromRequest(request);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const summary = await loadLeadSummary(ctx, id);
    if (!summary) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(summary);
  } catch (err) {
    console.error("[agent/leads/summary]", err);
    const message =
      err instanceof Error ? err.message : "Failed to load lead summary";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
