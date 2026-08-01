"use client";

export type PrimarySaveOutcome =
  | { status: "saved" }
  | { status: "needs_confirm"; existingCount: number }
  | { status: "auth" }
  | { status: "error"; message: string };

async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    if (typeof data.error === "string" && data.error.trim()) return data.error;
  } catch {
    // ignore
  }
  return fallback;
}

async function countExistingSearches(): Promise<
  | { status: "ok"; count: number }
  | { status: "auth" }
  | { status: "error"; message: string }
> {
  const res = await fetch("/api/saved-searches");
  if (res.status === 401) return { status: "auth" };
  if (!res.ok) {
    return {
      status: "error",
      message: await readApiError(res, "Could not load saved searches."),
    };
  }
  const data = (await res.json()) as { items?: unknown[] };
  return { status: "ok", count: data.items?.length ?? 0 };
}

/** Create a new primary saved search (demotes previous primary to secondary). */
export async function createPrimarySavedSearch(input: {
  name: string;
  query: Record<string, unknown>;
}): Promise<PrimarySaveOutcome> {
  const res = await fetch("/api/saved-searches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      query: input.query,
      emailAlerts: true,
      asPrimary: true,
    }),
  });
  if (res.status === 401) return { status: "auth" };
  if (!res.ok) {
    return {
      status: "error",
      message: await readApiError(res, "Could not save search."),
    };
  }
  window.dispatchEvent(new Event("houzzat:saved-searches-changed"));
  return { status: "saved" };
}

/**
 * Save as primary buyer search. If the customer already has any saved search
 * and `confirmReplace` is false, returns needs_confirm instead of writing.
 */
export async function savePrimarySearch(input: {
  name: string;
  query: Record<string, unknown>;
  confirmReplace?: boolean;
}): Promise<PrimarySaveOutcome> {
  const existing = await countExistingSearches();
  if (existing.status === "auth") return { status: "auth" };
  if (existing.status === "error") return existing;

  if (existing.count > 0 && !input.confirmReplace) {
    return { status: "needs_confirm", existingCount: existing.count };
  }

  return createPrimarySavedSearch({
    name: input.name,
    query: input.query,
  });
}
