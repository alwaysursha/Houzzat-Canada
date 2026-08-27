/**
 * Stage 3K.5.10.4 — safe HouzzatPRO mobile runtime diagnostic helpers.
 * No secrets: sanitize URLs, cap traces, detect refresh loops.
 */

export const MOBILE_DIAG_TRACE_KEY = "houzzat_mobile_diag_trace_v1";
export const MOBILE_DIAG_NAV_KEY = "houzzat_mobile_diag_nav_v1";
export const MOBILE_DIAG_MAX_EVENTS = 30;
export const MOBILE_DIAG_LOOP_THRESHOLD = 4;

export const MOBILE_DIAG_EVENT_TYPES = [
  "APP_BOOT",
  "PLATFORM_SESSION_FOUND",
  "PLATFORM_SESSION_MISSING",
  "WORKSPACE_BOOTSTRAP_START",
  "WORKSPACE_COUNT_0",
  "WORKSPACE_COUNT_1",
  "WORKSPACE_SELECTOR",
  "HANDOFF_MINT_START",
  "HANDOFF_MINT_SUCCESS",
  "HANDOFF_MINT_FAILED",
  "NAVIGATE_TENANT",
  "HANDOFF_EXCHANGE_START",
  "HANDOFF_EXCHANGE_SUCCESS",
  "HANDOFF_EXCHANGE_FAILED",
  "TENANT_SESSION_FOUND",
  "TENANT_SESSION_MISSING",
  "DESTINATION_ADMIN",
  "DESTINATION_AGENT",
  "REDIRECT_PRO",
  "REDIRECT_SIGN_IN",
] as const;

export type MobileDiagEventType = (typeof MOBILE_DIAG_EVENT_TYPES)[number];

export type MobileDiagEvent = {
  type: MobileDiagEventType;
  at: number;
  host: string;
  path: string;
  reason?: string;
};

export type MobileDiagNavStep = {
  at: number;
  origin: string;
  path: string;
};

/** Query keys that must never appear in diagnostic displays. */
const SECRET_QUERY_KEYS = new Set([
  "code",
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "session",
  "csrf",
  "csrfToken",
  "state",
  "handoff",
  "handoffCode",
  "rawCode",
  "password",
  "secret",
  "key",
  "authorization",
  "bearer",
  "firebase",
  "fcm",
]);

export function isSecretQueryKey(key: string): boolean {
  const k = key.trim().toLowerCase();
  if (SECRET_QUERY_KEYS.has(k)) return true;
  if (k.includes("token")) return true;
  if (k.includes("secret")) return true;
  if (k.includes("password")) return true;
  if (k.endsWith("code") && k !== "versioncode") return true;
  return false;
}

/** Strip secret query params and hash from a URL/href for safe display. */
export function sanitizeDiagnosticHref(raw: string): string {
  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "https://example.invalid";
    const url = new URL(raw, base);
    const kept = new URLSearchParams();
    for (const [key, value] of url.searchParams.entries()) {
      if (isSecretQueryKey(key)) {
        kept.set(key, "redacted");
        continue;
      }
      kept.set(key, value);
    }
    const qs = kept.toString();
    return `${url.origin}${url.pathname}${qs ? `?${qs}` : ""}`;
  } catch {
    return "[invalid-url]";
  }
}

export function maskUserId(id: string | null | undefined): string | null {
  if (!id) return null;
  if (id.length <= 8) return `${id.slice(0, 2)}…`;
  return `${id.slice(0, 6)}…${id.slice(-2)}`;
}

export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const localMask =
    local.length <= 1 ? "*" : `${local.slice(0, 1)}***`;
  const domainParts = domain.split(".");
  const domainMask = domainParts
    .map((part, i) =>
      i === domainParts.length - 1 ? part : `${part.slice(0, 1)}***`,
    )
    .join(".");
  return `${localMask}@${domainMask}`;
}

export function isPlatformBootstrapHostOk(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().split(":")[0] ?? "";
  return host === "houzzatpro.com" || host === "www.houzzatpro.com";
}

export function classifyBootstrapHost(hostname: string): {
  ok: boolean;
  label:
    | "platform_bootstrap"
    | "houzzat_tenant"
    | "tenant_canary"
    | "godaddy_lander"
    | "unknown";
} {
  const host = hostname.trim().toLowerCase().split(":")[0] ?? "";
  if (host === "houzzatpro.com" || host === "www.houzzatpro.com") {
    return { ok: true, label: "platform_bootstrap" };
  }
  if (host === "houzzat.com" || host === "www.houzzat.com" || host === "houzzat.houzzatpro.com") {
    return { ok: false, label: "houzzat_tenant" };
  }
  if (
    host === "tenant-canary.houzzatpro.com" ||
    host === "canary.houzzat.com"
  ) {
    return { ok: false, label: "tenant_canary" };
  }
  if (host.includes("godaddy") || host === "lander") {
    return { ok: false, label: "godaddy_lander" };
  }
  return { ok: false, label: "unknown" };
}

export function parseDiagnosticEvents(raw: string | null): MobileDiagEvent[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: MobileDiagEvent[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      if (typeof row.type !== "string") continue;
      if (!MOBILE_DIAG_EVENT_TYPES.includes(row.type as MobileDiagEventType)) {
        continue;
      }
      out.push({
        type: row.type as MobileDiagEventType,
        at: typeof row.at === "number" ? row.at : 0,
        host: typeof row.host === "string" ? row.host : "",
        path: typeof row.path === "string" ? row.path : "",
        reason: typeof row.reason === "string" ? row.reason : undefined,
      });
    }
    return out.slice(-MOBILE_DIAG_MAX_EVENTS);
  } catch {
    return [];
  }
}

export function appendDiagnosticEvent(
  existing: MobileDiagEvent[],
  event: Omit<MobileDiagEvent, "at"> & { at?: number },
): MobileDiagEvent[] {
  const next: MobileDiagEvent = {
    type: event.type,
    at: event.at ?? Date.now(),
    host: event.host,
    path: event.path,
    reason: event.reason,
  };
  return [...existing, next].slice(-MOBILE_DIAG_MAX_EVENTS);
}

export function parseNavSteps(raw: string | null): MobileDiagNavStep[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: MobileDiagNavStep[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      if (typeof row.origin !== "string" || typeof row.path !== "string") continue;
      out.push({
        at: typeof row.at === "number" ? row.at : 0,
        origin: row.origin,
        path: row.path,
      });
    }
    return out.slice(-MOBILE_DIAG_MAX_EVENTS);
  } catch {
    return [];
  }
}

export function appendNavStep(
  existing: MobileDiagNavStep[],
  step: Omit<MobileDiagNavStep, "at"> & { at?: number },
): MobileDiagNavStep[] {
  const next: MobileDiagNavStep = {
    at: step.at ?? Date.now(),
    origin: step.origin,
    path: step.path,
  };
  const last = existing[existing.length - 1];
  if (last && last.origin === next.origin && last.path === next.path) {
    return existing;
  }
  return [...existing, next].slice(-MOBILE_DIAG_MAX_EVENTS);
}

/**
 * Detect repeated origin+path sequences (refresh / redirect loops).
 * Returns true when the same key appears >= threshold in recent steps.
 */
export function detectRefreshLoop(
  steps: MobileDiagNavStep[],
  threshold = MOBILE_DIAG_LOOP_THRESHOLD,
): { possible: boolean; chain: string[]; repeatingKey: string | null } {
  const chain = steps.map((s) => {
    try {
      const host = new URL(s.origin).hostname;
      return `${host}${s.path}`;
    } catch {
      return `${s.origin}${s.path}`;
    }
  });
  if (chain.length < threshold) {
    return { possible: false, chain, repeatingKey: null };
  }
  const counts = new Map<string, number>();
  for (const key of chain) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let repeatingKey: string | null = null;
  let max = 0;
  for (const [key, count] of counts) {
    if (count > max) {
      max = count;
      repeatingKey = key;
    }
  }
  return {
    possible: max >= threshold,
    chain,
    repeatingKey: max >= threshold ? repeatingKey : null,
  };
}

/** Client-only: record a safe diagnostic event to sessionStorage. */
export function recordMobileDiagEvent(
  type: MobileDiagEventType,
  reason?: string,
): void {
  if (typeof window === "undefined") return;
  try {
    const existing = parseDiagnosticEvents(
      sessionStorage.getItem(MOBILE_DIAG_TRACE_KEY),
    );
    const next = appendDiagnosticEvent(existing, {
      type,
      host: window.location.hostname,
      path: window.location.pathname,
      reason,
    });
    sessionStorage.setItem(MOBILE_DIAG_TRACE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }
}

/** Client-only: record navigation step for loop detection. */
export function recordMobileDiagNav(): void {
  if (typeof window === "undefined") return;
  try {
    const existing = parseNavSteps(sessionStorage.getItem(MOBILE_DIAG_NAV_KEY));
    const next = appendNavStep(existing, {
      origin: window.location.origin,
      path: window.location.pathname,
    });
    sessionStorage.setItem(MOBILE_DIAG_NAV_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function clearMobileDiagTrace(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(MOBILE_DIAG_TRACE_KEY);
    sessionStorage.removeItem(MOBILE_DIAG_NAV_KEY);
  } catch {
    // ignore
  }
}

export function readMobileDiagTrace(): MobileDiagEvent[] {
  if (typeof window === "undefined") return [];
  try {
    return parseDiagnosticEvents(sessionStorage.getItem(MOBILE_DIAG_TRACE_KEY));
  } catch {
    return [];
  }
}

export function readMobileDiagNav(): MobileDiagNavStep[] {
  if (typeof window === "undefined") return [];
  try {
    return parseNavSteps(sessionStorage.getItem(MOBILE_DIAG_NAV_KEY));
  } catch {
    return [];
  }
}

export type SafeBootstrapProbe = {
  httpStatus: number | null;
  authenticated: boolean | null;
  bootstrapKind: string | null;
  membershipCount: number | null;
  workspaceSlugs: string[];
  primaryRole: string | null;
  canonicalHostname: string | null;
  intendedDestination: string | null;
  handoffRequired: boolean | null;
  error: string | null;
};

export type SafeSessionProbe = {
  httpStatus: number | null;
  authenticated: boolean | null;
  role: string | null;
  userIdMasked: string | null;
  emailMasked: string | null;
  error: string | null;
};

function readMembershipSafe(m: unknown): {
  slug: string | null;
  role: string | null;
  canonicalHostname: string | null;
} {
  if (!m || typeof m !== "object") {
    return { slug: null, role: null, canonicalHostname: null };
  }
  const row = m as Record<string, unknown>;
  return {
    slug: typeof row.slug === "string" ? row.slug : null,
    role: typeof row.role === "string" ? row.role : null,
    canonicalHostname:
      typeof row.canonicalHostname === "string" ? row.canonicalHostname : null,
  };
}

export function summarizeBootstrapPayload(
  status: number,
  body: unknown,
): SafeBootstrapProbe {
  if (!body || typeof body !== "object") {
    return {
      httpStatus: status,
      authenticated: null,
      bootstrapKind: null,
      membershipCount: null,
      workspaceSlugs: [],
      primaryRole: null,
      canonicalHostname: null,
      intendedDestination: null,
      handoffRequired: null,
      error: "invalid_json",
    };
  }
  const data = body as Record<string, unknown>;
  const bootstrap =
    data.bootstrap && typeof data.bootstrap === "object"
      ? (data.bootstrap as Record<string, unknown>)
      : null;
  const kind = typeof bootstrap?.kind === "string" ? bootstrap.kind : null;
  const memberships = Array.isArray(data.memberships)
    ? data.memberships
    : bootstrap && Array.isArray(bootstrap.memberships)
      ? bootstrap.memberships
      : [];
  const slugs: string[] = [];
  let primaryRole: string | null = null;
  let canonicalHostname: string | null = null;
  for (const m of memberships) {
    const safe = readMembershipSafe(m);
    if (safe.slug && !slugs.includes(safe.slug)) slugs.push(safe.slug);
    if (!primaryRole && safe.role) primaryRole = safe.role;
    if (!canonicalHostname && safe.canonicalHostname) {
      canonicalHostname = safe.canonicalHostname;
    }
  }

  const singleMembership =
    bootstrap?.membership && typeof bootstrap.membership === "object"
      ? readMembershipSafe(bootstrap.membership)
      : null;
  if (singleMembership?.slug && !slugs.includes(singleMembership.slug)) {
    slugs.push(singleMembership.slug);
  }
  if (singleMembership?.role) primaryRole = singleMembership.role;
  if (singleMembership?.canonicalHostname) {
    canonicalHostname = singleMembership.canonicalHostname;
  }

  let intendedDestination: string | null = null;
  if (typeof bootstrap?.destination === "string") {
    intendedDestination = bootstrap.destination;
  } else if (primaryRole) {
    const expected = expectedMobileDestination({
      workspaceSlug: slugs[0] ?? null,
      workspaceRole: primaryRole,
    });
    intendedDestination = expected?.path ?? null;
  }

  const handoffRequired =
    kind === "handoff" || kind === "select_workspace"
      ? true
      : kind === "tenant_destination" || kind === "no_workspace"
        ? false
        : null;

  const countFromList = memberships.length;
  const count =
    countFromList > 0
      ? countFromList
      : singleMembership?.slug
        ? 1
        : kind === "no_workspace"
          ? 0
          : slugs.length || null;

  return {
    httpStatus: status,
    authenticated:
      typeof data.authenticated === "boolean" ? data.authenticated : null,
    bootstrapKind: kind,
    membershipCount: count,
    workspaceSlugs: slugs.slice(0, 8),
    primaryRole,
    canonicalHostname,
    intendedDestination,
    handoffRequired,
    error: null,
  };
}

export function summarizeSessionPayload(
  status: number,
  body: unknown,
): SafeSessionProbe {
  if (!body || typeof body !== "object") {
    return {
      httpStatus: status,
      authenticated: false,
      role: null,
      userIdMasked: null,
      emailMasked: null,
      error: status === 200 ? "empty_session" : "invalid_json",
    };
  }
  const data = body as Record<string, unknown>;
  const user =
    data.user && typeof data.user === "object"
      ? (data.user as Record<string, unknown>)
      : null;
  if (!user) {
    return {
      httpStatus: status,
      authenticated: false,
      role: null,
      userIdMasked: null,
      emailMasked: null,
      error: null,
    };
  }
  return {
    httpStatus: status,
    authenticated: true,
    role: typeof user.role === "string" ? user.role : null,
    userIdMasked: maskUserId(typeof user.id === "string" ? user.id : null),
    emailMasked: maskEmail(typeof user.email === "string" ? user.email : null),
    error: null,
  };
}

/** Expected A/B destinations for operator checklist (display only). */
export function expectedMobileDestination(input: {
  workspaceSlug: string | null;
  workspaceRole: string | null;
}): { hostHint: string; path: string } | null {
  if (!input.workspaceSlug || !input.workspaceRole) return null;
  const role = input.workspaceRole.toUpperCase();
  const path =
    role === "OWNER" || role === "ADMIN"
      ? "/admin"
      : role === "AGENT"
        ? "/agent"
        : "/pro/for-staff";
  if (input.workspaceSlug === "tenant-canary") {
    return { hostHint: "tenant-canary.houzzatpro.com", path };
  }
  if (input.workspaceSlug === "houzzat") {
    return { hostHint: "houzzat.com", path };
  }
  return { hostHint: "(canonical host)", path };
}
