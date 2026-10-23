import { NextResponse } from "next/server";
import { ingestActivityBeacon, type BeaconPayload } from "@/lib/admin/activity";
import { auth } from "@/lib/auth";
import { scheduleNotifyCustomerCameOnline } from "@/lib/notifications/staff-events";
import { resolveRequestTenancy } from "@/lib/tenancy/resolve-request-tenancy";
import { evaluateHighOctaneStagingEnvironment } from "@/lib/tenancy/templates/high-octane-staging";
import { highOctanePreviewProcessReady } from "@/lib/tenancy/templates/high-octane-staging-preview";
import { isHighOctaneStagingAnalyticsSuppressed } from "@/lib/tenancy/templates/high-octane-staging-analytics";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: BeaconPayload;
  try {
    body = (await req.json()) as BeaconPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body?.visitorKey || !body?.sessionKey || !body?.type) {
    return NextResponse.json(
      { error: "visitorKey, sessionKey, and type are required" },
      { status: 400 },
    );
  }

  const session = await auth();
  const userAgent = req.headers.get("user-agent");

  if (evaluateHighOctaneStagingEnvironment().ready || highOctanePreviewProcessReady()) {
    const tenancy = await resolveRequestTenancy(req);
    if (
      isHighOctaneStagingAnalyticsSuppressed({
        workspaceSlug: tenancy.ok ? tenancy.workspaceSlug : null,
        hostname: tenancy.ok ? tenancy.hostname : null,
      })
    ) {
      return NextResponse.json({ ok: true, suppressed: true });
    }
  }

  try {
    const result = await ingestActivityBeacon(body, {
      userId: session?.user?.id ?? null,
      userAgent,
    });
    if (session?.user?.id) {
      let workspaceId: string | null = null;
      try {
        const tenancy = await resolveRequestTenancy(req);
        workspaceId = tenancy.ok ? tenancy.workspaceId : null;
      } catch {
        workspaceId = null;
      }
      scheduleNotifyCustomerCameOnline(
        session.user.id,
        result.previousLastSeenAt,
        workspaceId,
      );
    }
    return NextResponse.json({
      ok: true,
      visitorId: result.visitorId,
      sessionId: result.sessionId,
      eventId: result.eventId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Beacon failed" },
      { status: 400 },
    );
  }
}
