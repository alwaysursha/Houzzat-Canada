import { NextResponse } from "next/server";
import { z } from "zod";
import {
  DESK_AGENT_ALL,
  DESK_AGENT_COOKIE,
} from "@/lib/agent/desk-constants";
import { listTeamAgents } from "@/lib/agent/brokerage";
import { requireAgentContextFromRequest } from "@/lib/agent";

export const runtime = "nodejs";

const schema = z.object({
  deskAgentId: z.string().min(1).nullable(),
});

/** Team Leader picks which agent's desk to view (cookie). No session swap. */
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

  const requested = parsed.data.deskAgentId?.trim() || null;
  let value = DESK_AGENT_ALL;

  if (requested && requested !== DESK_AGENT_ALL) {
    const teamAgents = await listTeamAgents(
      ctx.organizationId,
      ctx.workspaceId,
    );
    const fieldAgent = teamAgents.find(
      (a) => a.id === requested && a.role === "AGENT",
    );
    if (!fieldAgent) {
      return NextResponse.json(
        { error: "Agent is not eligible for desk view in this workspace." },
        { status: 403 },
      );
    }
    value = fieldAgent.id;
  }

  const res = NextResponse.json({ ok: true, deskAgentId: value });
  res.cookies.set(DESK_AGENT_COOKIE, value, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 180,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
