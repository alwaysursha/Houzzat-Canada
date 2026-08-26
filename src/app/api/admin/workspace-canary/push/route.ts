import { NextResponse } from "next/server";
import { isTrustedStaffMutationOrigin } from "@/lib/active-workspace";
import { SITE_URL } from "@/lib/constants";
import { requireAdminUser } from "@/lib/owner/auth";
import { prisma } from "@/lib/prisma";
import {
  parseTenantBPushCanaryBody,
  runTenantBPushCanary,
  type TenantBPushCanaryResult,
} from "@/lib/workspace-canary/tenant-b-push-canary";

export const runtime = "nodejs";

/**
 * Stage 3J.11.2 — Worker-hosted Tenant B push canary.
 *
 * Platform ADMIN + same-origin only. Identity resolved server-side.
 * Body: { mode: "dry-run" | "send", confirm: "tenant-canary-push" }
 */
export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isTrustedStaffMutationOrigin(request, SITE_URL)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = parseTenantBPushCanaryBody(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const result: TenantBPushCanaryResult = await runTenantBPushCanary(
    prisma,
    parsed.value,
  );

  const status =
    result.status === "already_sent"
      ? 200
      : result.status === "dry-run" && result.ok
        ? 200
        : result.status === "sent"
          ? 200
          : result.status === "firebase_missing" || result.status === "blocked"
            ? 409
            : result.status === "failed"
              ? 502
              : 400;

  return NextResponse.json(result, { status });
}
