import { NextResponse } from "next/server";
import { requireAgentContext } from "@/lib/agent";
import {
  isDeskActivityCategory,
  loadDeskActivityFeed,
} from "@/lib/agent/desk-activity";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ctx = await requireAgentContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const categoryRaw = searchParams.get("category") ?? "all";
  const category = isDeskActivityCategory(categoryRaw) ? categoryRaw : "all";
  const takeRaw = Number(searchParams.get("take") ?? "60");
  const take = Number.isFinite(takeRaw) ? takeRaw : 60;

  const items = await loadDeskActivityFeed({ ctx, category, take });
  return NextResponse.json({ items, category });
}
