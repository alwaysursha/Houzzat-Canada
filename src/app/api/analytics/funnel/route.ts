import { NextResponse } from "next/server";
import {
  allowFunnelIngest,
  clientIpFromPublicRequest,
  ingestClientFunnelEvent,
  isFunnelEventsEnabled,
  parseClientFunnelPayload,
  FunnelSanitizeError,
} from "@/lib/funnel";
import { resolveRequestTenancy } from "@/lib/tenancy/resolve-request-tenancy";
import { isHighOctaneStagingAnalyticsSuppressed } from "@/lib/tenancy/templates/high-octane-staging-analytics";

export const runtime = "nodejs";

/**
 * Phase 2A — public tenant-scoped funnel ingest.
 * workspaceId is resolved from the request host only.
 * registration_completed and userId are rejected from clients.
 */
export async function POST(request: Request) {
  if (!isFunnelEventsEnabled()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Early validate (including spoofed workspaceId/userId) before tenancy DB work.
  try {
    parseClientFunnelPayload(body);
  } catch (error) {
    if (error instanceof FunnelSanitizeError) {
      const status =
        error.code === "SERVER_ONLY_EVENT" ||
        error.code === "CLIENT_USER_ID_FORBIDDEN" ||
        error.code === "CLIENT_WORKSPACE_ID_FORBIDDEN"
          ? 403
          : 400;
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status },
      );
    }
    throw error;
  }

  const tenancy = await resolveRequestTenancy(request);
  if (
    tenancy.ok &&
    isHighOctaneStagingAnalyticsSuppressed({ workspaceSlug: tenancy.workspaceSlug })
  ) {
    return NextResponse.json({ ok: true, suppressed: true });
  }
  if (!tenancy.ok) {
    return NextResponse.json(
      { error: "Unresolved tenant context", code: "TENANCY_REQUIRED" },
      { status: 403 },
    );
  }

  const visitorKey =
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    typeof (body as { visitorKey?: unknown }).visitorKey === "string"
      ? (body as { visitorKey: string }).visitorKey
      : "unknown";

  if (
    !allowFunnelIngest({
      clientIp: clientIpFromPublicRequest(request),
      visitorKey,
    })
  ) {
    return NextResponse.json(
      { error: "Rate limit exceeded", code: "RATE_LIMITED" },
      { status: 429 },
    );
  }

  const result = await ingestClientFunnelEvent({
    workspaceId: tenancy.workspaceId,
    body,
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
