/**
 * Gate for the local HIGH OCTANE email preview page.
 * This is not an authentication bypass. It refuses every deployed environment,
 * including production and Vercel Preview, even if development flags are set.
 */

const LOCAL_PREVIEW_PORT = "3010";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export type LocalEmailPreviewAccessInput = {
  env: NodeJS.ProcessEnv;
  host: string | null | undefined;
  forwardedHost?: string | null;
};

function parseHost(value: string): { hostname: string; port: string } | null {
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  if (raw.startsWith("[")) {
    const end = raw.indexOf("]");
    if (end < 1) return null;
    return {
      hostname: raw.slice(1, end),
      port: raw.slice(end + 1).replace(/^:/, ""),
    };
  }
  const separator = raw.lastIndexOf(":");
  if (separator > 0 && raw.indexOf(":") === separator) {
    return { hostname: raw.slice(0, separator), port: raw.slice(separator + 1) };
  }
  return { hostname: raw, port: "" };
}

function isLoopbackPreviewHost(value: string | null | undefined): boolean {
  if (!value) return false;
  const parsed = parseHost(value);
  if (!parsed) return false;
  return LOOPBACK_HOSTS.has(parsed.hostname) && parsed.port === LOCAL_PREVIEW_PORT;
}

export function localHighOctaneEmailPreviewAllowed(
  input: LocalEmailPreviewAccessInput,
): boolean {
  const env = input.env;
  if (env.NODE_ENV !== "development") return false;
  if (env.VERCEL?.trim()) return false;
  if (env.VERCEL_ENV?.trim()) return false;
  if (env.VERCEL_URL?.trim()) return false;
  if (env.HIGH_OCTANE_STAGING?.trim() !== "1") return false;
  if (!isLoopbackPreviewHost(input.host)) return false;
  const forwarded = input.forwardedHost?.trim();
  if (forwarded && !isLoopbackPreviewHost(forwarded)) return false;
  return true;
}
