import { NextResponse } from "next/server";
import { requireAgentContext } from "@/lib/agent";
import { loadLeadSummary } from "@/lib/agent/lead-summary";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const ctx = await requireAgentContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const summary = await loadLeadSummary(ctx, id);
  if (!summary) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(summary);
}
