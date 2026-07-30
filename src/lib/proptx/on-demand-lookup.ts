import {
  isOnDemandLookupQuery,
  looksLikeMlsQuery,
  parseExactAddressQuery,
  parseStreetOnlyQuery,
} from "@/lib/listings/search-match";
import { getMlsSyncCities } from "@/lib/proptx/sync-cities";
import {
  fetchPropertiesByExactAddress,
  fetchPropertiesByStreet,
  fetchPropertyByMls,
} from "@/lib/proptx/resolve-listing";
import { upsertPropTxPropertiesOnDemand } from "@/lib/proptx/sync";
import type { PropTxProperty } from "@/lib/proptx/map-listing";

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 12;

type RateBucket = { count: number; resetAt: number };
const rateByIp = new Map<string, RateBucket>();

function pruneRateMap(now: number) {
  if (rateByIp.size < 500) return;
  for (const [ip, bucket] of rateByIp) {
    if (bucket.resetAt <= now) rateByIp.delete(ip);
  }
}

/** Simple per-IP throttle for PropTx miss path (in-memory; best-effort). */
export function allowOnDemandLookup(clientIp: string | null | undefined): boolean {
  const ip = (clientIp ?? "unknown").slice(0, 64);
  const now = Date.now();
  pruneRateMap(now);
  const bucket = rateByIp.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    rateByIp.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_MAX_PER_WINDOW) return false;
  bucket.count += 1;
  return true;
}

export function clientIpFromRequest(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf?.trim()) return cf.trim();
  const xff = request.headers.get("x-forwarded-for");
  if (xff?.trim()) return xff.split(",")[0]!.trim();
  return "unknown";
}

export type OnDemandLookupResult = {
  mlsNumbers: string[];
  kind: "mls" | "address" | "street" | null;
};

/**
 * On Neon miss: fetch matching PropTx properties and upsert into Neon.
 * Only runs for MLS / exact address / street-only query shapes.
 */
export async function lookupAndUpsertOnDemand(
  q: string,
  options?: { clientIp?: string | null },
): Promise<OnDemandLookupResult> {
  const query = q.trim();
  const knownCities = getMlsSyncCities();
  if (!isOnDemandLookupQuery(query, knownCities)) {
    return { mlsNumbers: [], kind: null };
  }
  if (!allowOnDemandLookup(options?.clientIp)) {
    return { mlsNumbers: [], kind: null };
  }

  let rows: PropTxProperty[] = [];
  let kind: OnDemandLookupResult["kind"] = null;

  try {
    if (looksLikeMlsQuery(query)) {
      kind = "mls";
      const one = await fetchPropertyByMls(query);
      if (one) rows = [one];
    } else {
      const exact = parseExactAddressQuery(query);
      if (exact) {
        kind = "address";
        rows = await fetchPropertiesByExactAddress(exact);
      } else {
        const street = parseStreetOnlyQuery(query, knownCities);
        if (street) {
          kind = "street";
          rows = await fetchPropertiesByStreet(street, { max: 12 });
        }
      }
    }
  } catch {
    return { mlsNumbers: [], kind };
  }

  if (rows.length === 0) return { mlsNumbers: [], kind };

  try {
    const mlsNumbers = await upsertPropTxPropertiesOnDemand(rows, {
      concurrency: kind === "street" ? 3 : 2,
    });
    return { mlsNumbers, kind };
  } catch {
    return { mlsNumbers: [], kind };
  }
}
