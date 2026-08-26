/**
 * Stage 3K.2 — hostname normalization for WorkspaceDomain storage/lookup.
 *
 * Normalization ≠ canonicalization. `www` is preserved; primary/alias rows
 * represent www vs apex explicitly.
 */
import { toASCII } from "node:punycode";

export type NormalizeHostnameResult =
  | { ok: true; hostname: string }
  | { ok: false; error: string };

const HOSTNAME_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/;

function stripWrapping(input: string): string {
  let value = input.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

function decodeIdn(value: string): string {
  try {
    return toASCII(value).toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

/**
 * Normalize a hostname for persistence and lookup.
 * Rejects URLs with scheme/path/query; strips legal port syntax.
 */
export function normalizeWorkspaceHostname(
  raw: string,
): NormalizeHostnameResult {
  if (!raw || typeof raw !== "string") {
    return { ok: false, error: "hostname required" };
  }

  let value = stripWrapping(raw);

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return { ok: false, error: "hostname must not include protocol" };
  }
  if (value.includes("/") || value.includes("?") || value.includes("#")) {
    return { ok: false, error: "hostname must not include path or query" };
  }
  if (value.includes("@")) {
    return { ok: false, error: "hostname must not include userinfo" };
  }

  // Strip bracketed IPv6 port or hostname:port
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    if (end === -1) {
      return { ok: false, error: "malformed IPv6 hostname" };
    }
    const hostPart = value.slice(1, end);
    const rest = value.slice(end + 1);
    if (rest.startsWith(":")) {
      value = hostPart;
    } else if (rest.length > 0) {
      return { ok: false, error: "malformed hostname" };
    } else {
      value = hostPart;
    }
  } else {
    const colonCount = (value.match(/:/g) ?? []).length;
    if (colonCount === 1) {
      const [hostPart, portPart] = value.split(":");
      if (!/^\d+$/.test(portPart ?? "")) {
        return { ok: false, error: "invalid port" };
      }
      value = hostPart ?? value;
    } else if (colonCount > 1) {
      return { ok: false, error: "malformed hostname" };
    }
  }

  value = value.replace(/\.+$/, "").trim();
  if (!value) {
    return { ok: false, error: "hostname empty after normalization" };
  }

  const ascii = decodeIdn(value);
  if (!HOSTNAME_RE.test(ascii)) {
    return { ok: false, error: "invalid hostname labels" };
  }
  if (ascii.length > 253) {
    return { ok: false, error: "hostname too long" };
  }

  return { ok: true, hostname: ascii };
}

/** Whether `www.` prefix is present (normalization does not strip it). */
export function hostnameHasWwwPrefix(hostname: string): boolean {
  return hostname.startsWith("www.");
}

/**
 * Canonical redirect target for www alias rows (future edge/app redirect).
 * Does NOT mutate stored PRIMARY hostname.
 */
export function wwwAliasForPrimaryHostname(primaryHostname: string): string {
  return `www.${primaryHostname}`;
}
