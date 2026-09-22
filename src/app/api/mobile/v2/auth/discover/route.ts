/**
 * Phase 3 — POST /api/mobile/v2/auth/discover
 *
 * Pre-auth, password-gated tenant workspace discovery for HouzzatPRO mobile.
 * Does NOT issue tokens. Does NOT include PlatformOperator / NULL-workspace Users.
 *
 * Success: { matches: [{ workspaceId, displayName, slug, role }] }
 * Failure: same generic INVALID_CREDENTIALS as login (no email enumeration).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  allowMobileCredentialsAuthAttempt,
  mobileCredentialsRateLimitedResponse,
} from "@/lib/auth/mobile-credentials-rate-limit";
import { discoverTenantIdentitiesForCredentials } from "@/lib/mobile/v2/discover-tenant-identities";

export const runtime = "nodejs";

const discoverSchema = z.object({
  email: z.string().email().min(3).max(200),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = discoverSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "Invalid discover payload",
        },
        { status: 400 },
      );
    }

    const rate = allowMobileCredentialsAuthAttempt({
      request,
      email: parsed.data.email,
    });
    if (!rate.allowed) {
      return mobileCredentialsRateLimitedResponse(rate.retryAfterSec);
    }

    const result = await discoverTenantIdentitiesForCredentials({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
        },
        { status: 401 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        matches: result.matches.map((m) => ({
          workspaceId: m.workspaceId,
          displayName: m.displayName,
          slug: m.slug,
          role: m.role,
          // Intentionally omit userId from the wire — client only needs workspace choice.
        })),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message: msg },
      { status: 500 },
    );
  }
}
