/**
 * Temporary production hang probes for marketing SSR.
 * Search Vercel Runtime Logs for `[ssr-hang]` or `ssr-hang.`.
 *
 * Never logs cookies, tokens, credentials, or personal user data.
 */
import { headers } from "next/headers";

export const SSR_HANG_LOG_PREFIX = "[ssr-hang]";

export const SSR_HANG_EVENT = {
  tenancyStart: "ssr-hang.tenancy.start",
  tenancySuccess: "ssr-hang.tenancy.success",
  tenancyFailure: "ssr-hang.tenancy.failure",
  listingStart: "ssr-hang.listing.start",
  listingSuccess: "ssr-hang.listing.success",
  listingFailure: "ssr-hang.listing.failure",
  proptxStart: "ssr-hang.proptx.start",
  proptxSettled: "ssr-hang.proptx.settled",
} as const;

export type SsrHangNeonLookup = "HIT" | "MISS" | "SKIP";

export type SsrHangCorrelation = {
  requestId: string | null;
  host: string | null;
  route: string | null;
};

export type SsrHangLogFields = {
  event: string;
  ms?: number;
  neon?: SsrHangNeonLookup;
  resolved?: boolean;
  errorName?: string;
  errorCode?: string;
  requestId?: string | null;
  host?: string | null;
  route?: string | null;
};

const EMPTY_CORRELATION: SsrHangCorrelation = {
  requestId: null,
  host: null,
  route: null,
};

function firstHeaderValue(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first ? first : null;
}

/** Hostname only — drop port. Never returns forwarded-for or cookies. */
function hostnameFromHostHeader(value: string | null): string | null {
  const first = firstHeaderValue(value);
  if (!first) return null;
  const host = first.split(":")[0]?.trim() ?? "";
  return host || null;
}

export function ssrHangCorrelationFromHeaders(
  headerGet: (name: string) => string | null,
): SsrHangCorrelation {
  return {
    requestId: firstHeaderValue(headerGet("x-vercel-id")),
    host: hostnameFromHostHeader(
      headerGet("x-forwarded-host") ?? headerGet("host"),
    ),
    route:
      firstHeaderValue(headerGet("x-matched-path")) ??
      firstHeaderValue(headerGet("x-invoke-path")),
  };
}

export function ssrHangCorrelationFromRequest(
  request: Request | null,
): SsrHangCorrelation {
  if (!request) return EMPTY_CORRELATION;
  return ssrHangCorrelationFromHeaders((name) => request.headers.get(name));
}

export async function readSsrHangCorrelation(): Promise<SsrHangCorrelation> {
  try {
    const headerStore = await headers();
    return ssrHangCorrelationFromHeaders((name) => headerStore.get(name));
  } catch {
    return EMPTY_CORRELATION;
  }
}

export function ssrHangErrorFields(error: unknown): {
  errorName: string;
  errorCode?: string;
} {
  const errorName = error instanceof Error ? error.name : "Error";
  const code =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    /^P\d{4}$/.test(error.code)
      ? error.code
      : undefined;
  return code ? { errorName, errorCode: code } : { errorName };
}

export function logSsrHang(fields: SsrHangLogFields): void {
  const payload: Record<string, string | number | boolean> = {
    event: fields.event,
  };
  if (fields.ms != null && Number.isFinite(fields.ms)) {
    payload.ms = Math.max(0, Math.round(fields.ms));
  }
  if (fields.neon) payload.neon = fields.neon;
  if (fields.resolved != null) payload.resolved = fields.resolved;
  if (fields.errorName) payload.errorName = fields.errorName;
  if (fields.errorCode) payload.errorCode = fields.errorCode;
  if (fields.requestId) payload.requestId = fields.requestId;
  if (fields.host) payload.host = fields.host;
  if (fields.route) payload.route = fields.route;

  console.info(SSR_HANG_LOG_PREFIX, JSON.stringify(payload));
}
