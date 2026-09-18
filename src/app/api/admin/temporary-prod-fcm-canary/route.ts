/**
 * TEMPORARY PRODUCTION FCM CANARY
 *
 * Remove in the next ask after one successful production invocation.
 * Platform ADMIN + trusted origin + explicit confirm POST only.
 * Fixtures are server-side constants. Request cannot retarget.
 */
import { NextResponse } from "next/server";
import { isTrustedStaffMutationOriginForRequest } from "@/lib/active-workspace";
import { requireAdminUser } from "@/lib/owner/auth";
import {
  TEMPORARY_PROD_FCM_CANARY_MARK,
  authorizeTemporaryProdFcmCanary,
  parseTemporaryProdFcmCanaryBody,
  runTemporaryProdFcmCanary,
  type TemporaryProdFcmCanaryResult,
} from "@/lib/notifications/temporary-prod-fcm-canary";

export const runtime = "nodejs";

function httpStatusFor(result: TemporaryProdFcmCanaryResult): number {
  if (result.status === "already_sent") return 200;
  if (result.status === "dry-run" && result.ok) return 200;
  if (result.status === "sent") return 200;
  if (
    result.status === "firebase_not_configured" ||
    result.status === "blocked"
  ) {
    return 409;
  }
  if (result.status === "failed") return 502;
  return 400;
}

function safeJson(result: TemporaryProdFcmCanaryResult) {
  return {
    mark: TEMPORARY_PROD_FCM_CANARY_MARK,
    ok: result.ok,
    status: result.status,
    devices: result.devices,
    sent: result.sent,
    failed: result.failed,
    skipped: result.skipped,
    unregistered: result.unregistered,
    ...(result.error ? { error: result.error } : {}),
  };
}

/** Browser refresh / GET must never send. */
export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed", mark: TEMPORARY_PROD_FCM_CANARY_MARK },
    { status: 405 },
  );
}

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  const originOk = isTrustedStaffMutationOriginForRequest(request);
  const authz = authorizeTemporaryProdFcmCanary({
    authenticated: Boolean(admin),
    role: admin?.role ?? null,
    trustedOrigin: originOk,
  });
  if (!authz.ok) {
    return NextResponse.json(
      { error: authz.reason, mark: TEMPORARY_PROD_FCM_CANARY_MARK },
      { status: authz.status },
    );
  }

  const raw = await request.json().catch(() => null);
  const parsed = parseTemporaryProdFcmCanaryBody(raw);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error, mark: TEMPORARY_PROD_FCM_CANARY_MARK },
      { status: 400 },
    );
  }

  const result = await runTemporaryProdFcmCanary(parsed.value);
  return NextResponse.json(safeJson(result), { status: httpStatusFor(result) });
}
