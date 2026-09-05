import { NextResponse } from "next/server";
import { z } from "zod";
import { auth, signIn } from "@/lib/auth";
import { isValidWorkspaceIdShape } from "@/lib/active-workspace";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import {
  createMobileWorkspaceHandoff,
  hashHandoffCode,
  isMobileHandoffSignInErrorResult,
  peekMobileWorkspaceHandoff,
} from "@/lib/mobile/mobile-workspace-handoff";
import { prisma } from "@/lib/prisma";
import { loadMobileBootstrapMemberships } from "@/lib/mobile/load-bootstrap-memberships";
import { isTrustedStaffMutationOriginForRequest } from "@/lib/active-workspace";

export const runtime = "nodejs";

const bodySchema = z.object({
  workspaceId: z
    .string()
    .min(1)
    .refine(isValidWorkspaceIdShape, "Invalid workspaceId"),
  returnPath: z.string().max(64).optional().nullable(),
});

/** Issue a one-time cross-host workspace handoff from platform bootstrap. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isTrustedStaffMutationOriginForRequest(request)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  const hostname = extractTrustedRequestHostname(request);
  if (!hostname) {
    return NextResponse.json({ error: "Invalid host" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const memberships = await loadMobileBootstrapMemberships(session.user.id);
  const selected = memberships.find(
    (m) => m.workspaceId === parsed.data.workspaceId,
  );
  if (!selected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await createMobileWorkspaceHandoff({
    userId: session.user.id,
    workspaceId: selected.workspaceId,
    workspaceRole: selected.role,
    requestHostname: hostname,
    returnPath: parsed.data.returnPath,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    handoffUrl: result.handoff.handoffUrl,
    targetOrigin: result.handoff.targetOrigin,
    destination: result.handoff.destination,
    expiresAt: result.handoff.expiresAt.toISOString(),
  });
}

/**
 * Exchange handoff code for host-local session (tenant host only).
 *
 * Destination comes from ACTIVE WorkspaceMember.role (peek before consume),
 * not global User.role and not a post-signIn auth() re-read (cookies are often
 * unread in the same request after signIn).
 */
export async function PUT(request: Request) {
  const hostname = extractTrustedRequestHostname(request);
  if (!hostname) {
    console.error("[mobile-handoff-exchange] PUT failed: missing/invalid trusted request hostname");
    return NextResponse.json({ error: "Invalid host" }, { status: 400 });
  }

  const body = z
    .object({ code: z.string().min(8).max(256) })
    .safeParse(await request.json().catch(() => null));
  if (!body.success) {
    console.error("[mobile-handoff-exchange] PUT failed: invalid body payload");
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const peeked = await peekMobileWorkspaceHandoff({
    rawCode: body.data.code,
    requestHostname: hostname,
  });
  if (!peeked.ok) {
    console.error("[mobile-handoff-exchange] PUT peek failed:", {
      hostname,
      reason: peeked.error,
    });
    return NextResponse.json({ error: peeked.error }, { status: 401 });
  }

  // Fail closed: only allowlisted staff / onboarding destinations after exchange.
  if (
    peeked.destination !== "/admin" &&
    peeked.destination !== "/agent" &&
    peeked.destination !== "/onboarding"
  ) {
    console.error("[mobile-handoff-exchange] PUT invalid destination:", peeked.destination);
    return NextResponse.json({ error: "Invalid staff destination" }, { status: 401 });
  }

  const signInResult = await signIn("mobile-workspace-handoff", {
    code: body.data.code,
    hostname,
    redirect: false,
    redirectTo: peeked.destination,
  });

  if (isMobileHandoffSignInErrorResult(signInResult)) {
    console.error("[mobile-handoff-exchange] PUT signIn returned error:", {
      signInResult,
      hostname,
    });
    return NextResponse.json({ error: "Handoff sign-in failed" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    destination: peeked.destination,
    workspaceId: peeked.workspaceId,
    workspaceRole: peeked.workspaceRole,
  });
}
