import type {
  ListingPanelErrorBody,
  ListingPanelPayload,
} from "@/lib/listings/build-listing-panel";

/**
 * Client helper for ListingDetailPanel.
 * Not used by default listing clicks (iframe remains production default).
 */
export async function fetchListingPanel(
  mlsNumber: string,
  init?: RequestInit,
): Promise<
  | { ok: true; data: ListingPanelPayload }
  | { ok: false; status: number; error: string; body?: ListingPanelErrorBody }
> {
  const mls = mlsNumber.trim().toUpperCase();
  if (!mls) {
    return { ok: false, status: 400, error: "Missing MLS number" };
  }

  const res = await fetch(`/api/listings/${encodeURIComponent(mls)}/panel`, {
    credentials: "include",
    cache: "no-store",
    ...init,
  });

  if (!res.ok) {
    let error = `panel ${res.status}`;
    let body: ListingPanelErrorBody | undefined;
    try {
      body = (await res.json()) as ListingPanelErrorBody;
      if (body.error) error = body.error;
    } catch {
      // ignore
    }
    return { ok: false, status: res.status, error, body };
  }

  const data = (await res.json()) as ListingPanelPayload;
  return { ok: true, data };
}
