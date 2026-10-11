import { NextResponse } from "next/server";
import { requireCustomerUser } from "@/lib/account";
import {
  isFunnelContinuationIntentType,
  recordPostRegistrationContinuedEvent,
  resolveFunnelWorkspaceId,
} from "@/lib/funnel/phase2c";
import { isFunnelEventsEnabled } from "@/lib/funnel/constants";
import { isConsumerRole } from "@/lib/roles";

export const runtime = "nodejs";

/**
 * Phase 2C — authenticated post_registration_continued ingest.
 * userId / workspaceId come from the session + host tenancy only.
 */
export async function POST(request: Request) {
  if (!isFunnelEventsEnabled()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  const user = await requireCustomerUser();
  if (!user || !isConsumerRole(user.role)) {
    return NextResponse.json(
      { error: "Sign in required", code: "AUTH_REQUIRED" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;

  if ("userId" in raw && raw.userId != null) {
    return NextResponse.json(
      { error: "userId must not be supplied by the client", code: "CLIENT_USER_ID_FORBIDDEN" },
      { status: 403 },
    );
  }
  if ("workspaceId" in raw && raw.workspaceId != null) {
    return NextResponse.json(
      {
        error: "workspaceId must not be supplied by the client",
        code: "CLIENT_WORKSPACE_ID_FORBIDDEN",
      },
      { status: 403 },
    );
  }

  const intentRaw =
    typeof raw.intentType === "string" ? raw.intentType.trim() : "";
  if (!isFunnelContinuationIntentType(intentRaw)) {
    return NextResponse.json(
      { error: "Unknown or unsupported intentType", code: "INVALID_INTENT" },
      { status: 400 },
    );
  }

  const mlsNumber =
    typeof raw.mlsNumber === "string" ? raw.mlsNumber : null;

  const workspaceId = await resolveFunnelWorkspaceId({
    userWorkspaceId: user.workspaceId,
    request,
  });
  if (!workspaceId) {
    return NextResponse.json(
      { error: "Unresolved tenant context", code: "TENANCY_REQUIRED" },
      { status: 403 },
    );
  }

  const result = await recordPostRegistrationContinuedEvent({
    workspaceId,
    userId: user.id,
    role: user.role,
    intentType: intentRaw,
    mlsNumber,
    registeredAt: user.createdAt,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: result.httpStatus },
    );
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    id: result.id,
  });
}
