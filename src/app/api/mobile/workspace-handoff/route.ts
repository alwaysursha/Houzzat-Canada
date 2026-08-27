import { NextResponse } from "next/server";
import { z } from "zod";
import { auth, signIn } from "@/lib/auth";
import { isValidWorkspaceIdShape } from "@/lib/active-workspace";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import { createMobileWorkspaceHandoff } from "@/lib/mobile/mobile-workspace-handoff";
import { loadMobileBootstrapMemberships } from "@/lib/mobile/load-bootstrap-memberships";
import { isTrustedStaffMutationOriginForRequest } from "@/lib/active-workspace";

export const runtime = "nodejs";

const bodySchema = z.object({
  workspaceId: z
    .string()
    .min(1)
    .refine(isValidWorkspaceIdShape, "Invalid workspaceId"),
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

/** Exchange handoff code for host-local session (tenant host only). */
export async function PUT(request: Request) {
  const hostname = extractTrustedRequestHostname(request);
  if (!hostname) {
    return NextResponse.json({ error: "Invalid host" }, { status: 400 });
  }

  const body = z
    .object({ code: z.string().min(8).max(256) })
    .safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const signInResult = await signIn("mobile-workspace-handoff", {
    code: body.data.code,
    hostname,
    redirect: false,
  });

  if (!signInResult || (typeof signInResult === "object" && "error" in signInResult && signInResult.error)) {
    return NextResponse.json({ error: "Handoff expired or invalid" }, { status: 401 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Session not established" }, { status: 401 });
  }

  const memberships = await loadMobileBootstrapMemberships(session.user.id);
  const membership = memberships.find((m) => m.canonicalHostname === hostname);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const destination =
    membership.role === "AGENT"
      ? "/agent"
      : membership.role === "OWNER" || membership.role === "ADMIN"
        ? "/admin"
        : "/pro/for-staff";

  return NextResponse.json({ ok: true, destination });
}
