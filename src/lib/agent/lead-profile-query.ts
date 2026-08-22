/** Session-ordered lead ids for prev/next in the profile popup. */
export const LEAD_NAV_STORAGE_KEY = "houzzat-lead-nav-ids";

/** Fired after `replaceLeadQueryParam` updates the URL without Next.js navigation. */
export const LEAD_QUERY_CHANGE_EVENT = "houzzat:lead-query-change";

export function rememberLeadNavIds(ids: string[]) {
  try {
    sessionStorage.setItem(LEAD_NAV_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // ignore quota / private mode
  }
}

export function readLeadNavIds(): string[] {
  try {
    const raw = sessionStorage.getItem(LEAD_NAV_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function openLeadProfileHref(
  leadId: string,
  extras?: Record<string, string | undefined>,
) {
  const q = new URLSearchParams();
  q.set("lead", leadId);
  if (extras) {
    for (const [key, value] of Object.entries(extras)) {
      if (value) q.set(key, value);
    }
  }
  return `/agent/leads?${q.toString()}`;
}

export function readLeadQueryParam(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("lead");
}

/**
 * Update `?lead=` via History API — avoids Next.js soft navigation and
 * re-fetching the leads desk server component on open / next / prev / close.
 */
export function replaceLeadQueryParam(leadId: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (leadId) url.searchParams.set("lead", leadId);
  else url.searchParams.delete("lead");
  const nextHref = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", nextHref);
  window.dispatchEvent(
    new CustomEvent(LEAD_QUERY_CHANGE_EVENT, {
      detail: { leadId },
    }),
  );
}

/** True when already on the leads desk — safe to use History API for `?lead=`. */
export function isLeadsDeskPath(pathname: string) {
  return pathname === "/agent/leads";
}
