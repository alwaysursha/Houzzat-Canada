/**
 * Stage 6.11F.2A — injectable DNS TXT lookup for ownership verification.
 * Production uses Cloudflare DNS-over-HTTPS only (fixed resolver URL).
 */

export type DnsTxtLookupSuccess = {
  ok: true;
  /** Raw TXT answer strings from the resolver (may include DNS quoting). */
  answers: string[];
  /** True when the name has no TXT answers (including NXDOMAIN / empty NOERROR). */
  empty: boolean;
};

export type DnsTxtLookupFailure = {
  ok: false;
  reason: "timeout" | "http_error" | "invalid_response" | "network_error";
  message: string;
};

export type DnsTxtLookupResult = DnsTxtLookupSuccess | DnsTxtLookupFailure;

export type DnsTxtLookup = (input: {
  /** Fully-qualified DNS name, e.g. `_houzzatpro-challenge.example.com`. */
  name: string;
}) => Promise<DnsTxtLookupResult>;

/** Fixed Cloudflare public DoH endpoint — never user-controlled. */
export const CLOUDFLARE_DOH_JSON_URL = "https://cloudflare-dns.com/dns-query";

export const DNS_TXT_LOOKUP_TIMEOUT_MS = 8_000;

type DohJsonResponse = {
  Status?: number;
  Answer?: Array<{ type?: number; data?: unknown }>;
};

/**
 * Cloudflare DNS-over-HTTPS (application/dns-json) TXT lookup.
 * Resolver URL is constant — only `name` is derived from normalized hostname.
 */
export function createCloudflareDohTxtLookup(input?: {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): DnsTxtLookup {
  const fetchImpl = input?.fetchImpl ?? fetch;
  const timeoutMs = input?.timeoutMs ?? DNS_TXT_LOOKUP_TIMEOUT_MS;

  return async ({ name }) => {
    const recordName = name.trim().replace(/\.$/, "");
    if (!recordName) {
      return {
        ok: false,
        reason: "invalid_response",
        message: "DNS name required",
      };
    }

    const url = new URL(CLOUDFLARE_DOH_JSON_URL);
    url.searchParams.set("name", recordName);
    url.searchParams.set("type", "TXT");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/dns-json",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          ok: false,
          reason: "http_error",
          message: `DNS resolver HTTP ${response.status}`,
        };
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return {
          ok: false,
          reason: "invalid_response",
          message: "DNS resolver returned non-JSON body",
        };
      }

      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return {
          ok: false,
          reason: "invalid_response",
          message: "DNS resolver returned unexpected JSON shape",
        };
      }

      const json = body as DohJsonResponse;
      const status = typeof json.Status === "number" ? json.Status : -1;

      // NXDOMAIN
      if (status === 3) {
        return { ok: true, answers: [], empty: true };
      }

      // SERVFAIL / other hard DNS failures
      if (status !== 0) {
        return {
          ok: false,
          reason: "invalid_response",
          message: `DNS resolver status ${status}`,
        };
      }

      const answers: string[] = [];
      if (Array.isArray(json.Answer)) {
        for (const row of json.Answer) {
          // TXT = 16
          if (row && (row.type === 16 || row.type == null)) {
            if (typeof row.data === "string") {
              answers.push(row.data);
            }
          }
        }
      }

      return {
        ok: true,
        answers,
        empty: answers.length === 0,
      };
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "AbortError" || /aborted/i.test(error.message))
      ) {
        return {
          ok: false,
          reason: "timeout",
          message: "DNS resolver timed out",
        };
      }
      return {
        ok: false,
        reason: "network_error",
        message: "DNS resolver network error",
      };
    } finally {
      clearTimeout(timer);
    }
  };
}
