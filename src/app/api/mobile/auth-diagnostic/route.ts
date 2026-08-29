import { NextResponse } from "next/server";
import {
  AUTH_BUILD_MARKER,
  getRecentAuthServerDiagnostics,
} from "@/lib/auth/auth-diagnostic-buffer";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import { isPlatformMobileBootstrapHost } from "@/lib/mobile/platform-bootstrap";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const incomingHost = extractTrustedRequestHostname(request);
  const isPlatform = isPlatformMobileBootstrapHost(incomingHost);
  const userAgent = request.headers.get("user-agent") ?? "";
  const isNative =
    userAgent.includes("HouzzatNative/1") || userAgent.includes("com.houzzat.pro");

  const recent = getRecentAuthServerDiagnostics();

  return NextResponse.json({
    ok: true,
    build: AUTH_BUILD_MARKER,
    serverTimestamp: new Date().toISOString(),
    incomingHost,
    isPlatformHost: isPlatform,
    nativeShellDetected: isNative,
    recentEvents: recent,
  });
}
