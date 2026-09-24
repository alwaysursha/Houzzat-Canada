/**
 * Safe Chats diagnostics for temporary production debugging.
 * Never includes raw JWT, refresh tokens, passwords, or message bodies.
 */

export type ChatsDiagClass =
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "WORKSPACE_FORBIDDEN"
  | "NOT_FOUND"
  | "SERVER_ERROR"
  | "NETWORK"
  | "TIMEOUT"
  | "RESPONSE_SHAPE"
  | "OK"
  | "UNKNOWN";

export type ChatsTokenExpiryState = "valid" | "near_expiry" | "expired" | "unknown";

export type ChatsRequestDiagnostic = {
  requestAttempted: true;
  accessTokenPresent: boolean;
  tokenType: string | null;
  workspaceIdPresent: boolean;
  role: string | null;
  tokenExpiryState: ChatsTokenExpiryState;
  initialHttpStatus: number | null;
  refreshAttempted: boolean;
  refreshSucceeded: boolean | null;
  retryHttpStatus: number | null;
  serverCode: string | null;
  serverMessage: string | null;
  unwrapSucceeded: boolean | null;
  diagClass: ChatsDiagClass;
};

const NEAR_EXPIRY_MS = 2 * 60 * 1000;

/** Decode JWT payload claims without verifying — diagnostics only. */
export function inspectAccessTokenClaims(accessToken: string | null | undefined): {
  present: boolean;
  type: string | null;
  workspaceIdPresent: boolean;
  role: string | null;
  expiryState: ChatsTokenExpiryState;
} {
  if (!accessToken || !accessToken.trim()) {
    return {
      present: false,
      type: null,
      workspaceIdPresent: false,
      role: null,
      expiryState: "unknown",
    };
  }
  const parts = accessToken.split(".");
  if (parts.length < 2 || !parts[1]) {
    return {
      present: true,
      type: null,
      workspaceIdPresent: false,
      role: null,
      expiryState: "unknown",
    };
  }
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const json =
      typeof atob === "function"
        ? atob(padded + pad)
        : Buffer.from(padded + pad, "base64").toString("utf8");
    const payload = JSON.parse(json) as Record<string, unknown>;
    const type = typeof payload.type === "string" ? payload.type : null;
    const wsId =
      typeof payload.wsId === "string" ? payload.wsId.trim() : "";
    const role = typeof payload.role === "string" ? payload.role : null;
    const expSec = typeof payload.exp === "number" ? payload.exp : null;
    let expiryState: ChatsTokenExpiryState = "unknown";
    if (expSec != null && Number.isFinite(expSec)) {
      const expMs = expSec * 1000;
      const now = Date.now();
      if (now >= expMs) expiryState = "expired";
      else if (now >= expMs - NEAR_EXPIRY_MS) expiryState = "near_expiry";
      else expiryState = "valid";
    }
    return {
      present: true,
      type,
      workspaceIdPresent: Boolean(wsId),
      role,
      expiryState,
    };
  } catch {
    return {
      present: true,
      type: null,
      workspaceIdPresent: false,
      role: null,
      expiryState: "unknown",
    };
  }
}

export function classifyChatsFailure(input: {
  httpStatus: number | null;
  code: string | null;
  unwrapFailed?: boolean;
  network?: boolean;
  timeout?: boolean;
}): ChatsDiagClass {
  if (input.unwrapFailed) return "RESPONSE_SHAPE";
  if (input.timeout) return "TIMEOUT";
  if (input.network) return "NETWORK";
  const code = (input.code ?? "").toUpperCase();
  if (code === "AUTH_REQUIRED" || input.httpStatus === 401) return "AUTH_REQUIRED";
  if (code === "WORKSPACE_FORBIDDEN") return "WORKSPACE_FORBIDDEN";
  if (code === "FORBIDDEN" || input.httpStatus === 403) return "FORBIDDEN";
  if (code === "NOT_FOUND" || input.httpStatus === 404) return "NOT_FOUND";
  if (code === "SERVER_ERROR" || (input.httpStatus != null && input.httpStatus >= 500)) {
    return "SERVER_ERROR";
  }
  if (code === "NETWORK_ERROR") return "NETWORK";
  if (code === "TIMEOUT") return "TIMEOUT";
  return "UNKNOWN";
}

/** Customer-facing copy — includes a non-sensitive diagnostic code. */
export function formatChatsLoadError(diag: Pick<ChatsRequestDiagnostic, "diagClass" | "serverMessage">): string {
  const tag = diag.diagClass;
  const base = "Couldn't load chats";
  switch (tag) {
    case "AUTH_REQUIRED":
      return `${base}. [${tag}] Session may need refresh — try again or sign in.`;
    case "FORBIDDEN":
    case "WORKSPACE_FORBIDDEN":
      return `${base}. [${tag}] Workspace access denied for chat.`;
    case "NOT_FOUND":
      return `${base}. [${tag}] Chat service unavailable.`;
    case "SERVER_ERROR":
      return `${base}. [${tag}] Server error — try again shortly.`;
    case "NETWORK":
    case "TIMEOUT":
      return `${base}. [${tag}] Check your connection and retry.`;
    case "RESPONSE_SHAPE":
      return `${base}. [${tag}] Unexpected response.`;
    default:
      return diag.serverMessage?.trim()
        ? `${base}. [${tag}] ${diag.serverMessage.trim()}`
        : `${base}. [${tag}]`;
  }
}

/** Assert diagnostic objects never contain token material (tests). */
export function chatsDiagnosticLooksSafe(value: unknown): boolean {
  const raw = JSON.stringify(value ?? "");
  if (/Bearer\s+[A-Za-z0-9\-._~+/]+=*/i.test(raw)) return false;
  if (/"accessToken"\s*:/i.test(raw)) return false;
  if (/"refreshToken"\s*:/i.test(raw)) return false;
  if (/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\./.test(raw)) return false;
  return true;
}
