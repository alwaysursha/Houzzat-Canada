import { NextResponse } from "next/server";
import { requireAgentContextFromRequest } from "@/lib/agent";
import {
  loadWorkspaceAgentProfile,
  updateWorkspaceAgentProfile,
} from "@/lib/agent/admin-managed-profile";
import { resolveTeamAuthority } from "@/lib/workspace-team";

export const runtime = "nodejs";

async function loadAuthorizedProfile(request: Request) {
  const ctx = await requireAgentContextFromRequest(request);
  if (!ctx) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const authority = resolveTeamAuthority(ctx);
  if (authority.mode === "unavailable") {
    return {
      error: NextResponse.json(
        {
          error: "Select an active Workspace to manage Team.",
          code: "WORKSPACE_CONTEXT_REQUIRED",
        },
        { status: 403 },
      ),
    };
  }
  if (authority.mode !== "workspace") {
    return {
      error: NextResponse.json(
        { error: "Workspace Team is required for Agent profiles." },
        { status: 403 },
      ),
    };
  }
  return { ctx };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId } = await context.params;
  const authz = await loadAuthorizedProfile(request);
  if ("error" in authz && authz.error) return authz.error;
  if (!("ctx" in authz) || !authz.ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await loadWorkspaceAgentProfile(authz.ctx, userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, profile: result.profile });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId } = await context.params;
  const authz = await loadAuthorizedProfile(request);
  if ("error" in authz && authz.error) return authz.error;
  if (!("ctx" in authz) || !authz.ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  const result = await updateWorkspaceAgentProfile({
    ctx: authz.ctx,
    userId,
    raw: body,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, profile: result.profile });
}
