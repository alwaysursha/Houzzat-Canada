import { NextResponse } from "next/server";
import { z } from "zod";
import {
  DESK_AGENT_ALL,
  DESK_AGENT_COOKIE,
} from "@/lib/agent/desk-constants";
import { requireAgentContextFromRequest } from "@/lib/agent";

export const runtime = "nodejs";

const schema = z.object({
  deskAgentId: z.string().min(1).nullable(),
});

/** Team Leader picks which agent's desk to view (cookie). */
export async function POST(request: Request) {
  const ctx = await requireAgentContextFromRequest(request);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Team leaders (workspace OWNER/ADMIN or legacy platform Admin) may switch desks.
  if (!ctx.canSeeTeamLeads) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const value = parsed.data.deskAgentId?.trim() || DESK_AGENT_ALL;
  const res = NextResponse.json({ ok: true, deskAgentId: value });
  res.cookies.set(DESK_AGENT_COOKIE, value, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 180,
  });
  return res;
}
