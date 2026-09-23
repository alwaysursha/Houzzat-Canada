import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PASSWORD_RESET_COOLDOWN_MS,
  requestPasswordReset,
  resolvePasswordResetContext,
  resolvePlatformTenantPasswordResetTargets,
} from "@/lib/auth/password-reset";
import { normalizeIdentityEmail } from "@/lib/auth/workspace-identity";
import { sanitizeWorkspaceHintId } from "@/lib/platform/activation/onboarding-pro-auth";
import { isPlatformMobileBootstrapHost } from "@/lib/mobile/platform-bootstrap";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";

const schema = z.object({
  email: z.string().trim().email().max(254),
  workspaceHint: z.string().trim().min(8).max(64).optional(),
});

const lastSentByKey = new Map<string, number>();

function opaqueOk() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const email = normalizeIdentityEmail(parsed.data.email);
  const workspaceHint = sanitizeWorkspaceHintId(
    parsed.data.workspaceHint ?? null,
  );
  const { origin, siteName, workspaceId } =
    await resolvePasswordResetContext(request);
  const hostname = extractTrustedRequestHostname(request);
  const onProBootstrap = isPlatformMobileBootstrapHost(hostname);

  const targets: Array<{ workspaceId: string }> = [];

  if (workspaceId) {
    // Tenant host: only that workspace.
    targets.push({ workspaceId });
  } else if (onProBootstrap) {
    // Central Pro: resolve password-bearing tenant identities (never NULL/platform).
    const resolved = await resolvePlatformTenantPasswordResetTargets({
      email,
      workspaceHint,
    });
    for (const row of resolved) {
      targets.push({ workspaceId: row.workspaceId });
    }
  } else {
    // Sales apex / unknown host without tenancy: opaque no-op (anti-enumeration).
    return opaqueOk();
  }

  if (targets.length === 0) {
    return opaqueOk();
  }

  for (const target of targets) {
    const cooldownKey = `${target.workspaceId}:${email}`;
    const last = lastSentByKey.get(cooldownKey) ?? 0;
    if (Date.now() - last < PASSWORD_RESET_COOLDOWN_MS) {
      return NextResponse.json(
        { error: "Please wait a minute before requesting another email." },
        { status: 429 },
      );
    }
    lastSentByKey.set(cooldownKey, Date.now());

    try {
      await requestPasswordReset({
        email,
        origin,
        siteName,
        workspaceId: target.workspaceId,
      });
    } catch (error) {
      console.error("[password-reset] request failed", error);
    }
  }

  return opaqueOk();
}
