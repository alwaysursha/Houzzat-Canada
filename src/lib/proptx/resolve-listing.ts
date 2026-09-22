import {
  getPropTxIdxConfig,
  getPropTxVowConfig,
  type PropTxConfig,
} from "@/lib/proptx/config";
import { PropTxError, proptxJson } from "@/lib/proptx/client";
import type {
  ParsedExactAddress,
  ParsedStreetOnly,
} from "@/lib/listings/search-match";
import {
  mapListingKey,
  mapMlsNumber,
  type PropTxProperty,
} from "@/lib/proptx/map-listing";

const STREET_TOP = 12;
const LOOKUP_TIMEOUT_MS = 4000;

function odataStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function lookupConfigs(): PropTxConfig[] {
  const idx = getPropTxIdxConfig();
  const vow = getPropTxVowConfig();
  const out: PropTxConfig[] = [];
  if (idx) out.push(idx);
  if (vow && vow.tokenId !== idx?.tokenId) out.push(vow);
  return out;
}

function lookupConfigsVowFirst(): PropTxConfig[] {
  const idx = getPropTxIdxConfig();
  const vow = getPropTxVowConfig();
  const out: PropTxConfig[] = [];
  if (vow) out.push(vow);
  if (idx && idx.tokenId !== vow?.tokenId) out.push(idx);
  return out;
}

async function tryFiltersCollect(
  filters: string[],
  top: number,
  options?: { vowFirst?: boolean; timeoutMs?: number },
): Promise<PropTxProperty[]> {
  const configs = options?.vowFirst ? lookupConfigsVowFirst() : lookupConfigs();
  if (configs.length === 0) return [];
  const timeoutMs = options?.timeoutMs ?? LOOKUP_TIMEOUT_MS;

  const rows = await runWithAbort(timeoutMs, async (signal) => {
    const collected: PropTxProperty[] = [];
    for (const config of configs) {
      for (const filter of filters) {
        if (signal.aborted) throw signal.reason ?? new Error("aborted");
        try {
          const found = await queryPropertyFilter(filter, config, top, signal);
          if (found.length) collected.push(...found);
        } catch (err) {
          if (signal.aborted) throw err;
          // Search keeps trying the next filter. Address history does not use this.
        }
      }
      if (collected.length > 0) break;
    }
    return dedupeProperties(collected);
  });
  return rows ?? [];
}


type ODataList = { value?: PropTxProperty[] };

async function runWithAbort<T>(
  timeoutMs: number,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await work(controller.signal);
  } catch (err) {
    if (controller.signal.aborted) return null;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function queryPropertyFilter(
  filter: string,
  config: PropTxConfig,
  top: number,
  signal?: AbortSignal,
): Promise<PropTxProperty[]> {
  const path = `Property?$filter=${encodeURIComponent(filter)}&$top=${top}`;
  try {
    const data = await proptxJson<ODataList>(path, config, {
      signal,
      timeoutMs: LOOKUP_TIMEOUT_MS,
    });
    return data.value ?? [];
  } catch (err) {
    if (signal?.aborted) throw err;
    if (err instanceof PropTxError && (err.status === 404 || err.status === 400)) {
      return [];
    }
    throw err;
  }
}

function streetNameCore(streetName: string): string {
  // AMPRE StreetName is often without suffix ("Wismer" not "Wismer Street")
  return streetName.trim();
}

function unparsedNeedle(parts: {
  streetNumber?: string;
  streetName: string;
  streetType?: string | null;
}): string {
  return [parts.streetNumber, parts.streetName, parts.streetType]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function cityClause(city: string | null | undefined): string | null {
  if (!city?.trim()) return null;
  return `contains(City, ${odataStringLiteral(city.trim())})`;
}

function preferActiveThenNewest(rows: PropTxProperty[]): PropTxProperty[] {
  return [...rows].sort((a, b) => {
    const aActive =
      String(a.StandardStatus ?? a.MlsStatus ?? "").toLowerCase() === "active"
        ? 0
        : 1;
    const bActive =
      String(b.StandardStatus ?? b.MlsStatus ?? "").toLowerCase() === "active"
        ? 0
        : 1;
    if (aActive !== bActive) return aActive - bActive;
    const aMod = String(a.ModificationTimestamp ?? "");
    const bMod = String(b.ModificationTimestamp ?? "");
    return bMod.localeCompare(aMod);
  });
}

function dedupeProperties(rows: PropTxProperty[]): PropTxProperty[] {
  const seen = new Set<string>();
  const out: PropTxProperty[] = [];
  for (const row of rows) {
    const key =
      mapListingKey(row) ||
      mapMlsNumber(row) ||
      String(row.ListingKey ?? row.ListingId ?? "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

async function tryFilters(
  filters: string[],
  top: number,
): Promise<PropTxProperty[]> {
  const configs = lookupConfigs();
  if (configs.length === 0) return [];

  const rows = await runWithAbort(LOOKUP_TIMEOUT_MS, async (signal) => {
    for (const config of configs) {
      for (const filter of filters) {
        if (signal.aborted) throw signal.reason ?? new Error("aborted");
        try {
          const found = await queryPropertyFilter(filter, config, top, signal);
          if (found.length > 0) return dedupeProperties(found);
        } catch (err) {
          if (signal.aborted) throw err;
        }
      }
    }
    return [] as PropTxProperty[];
  });
  return rows ?? [];
}

/** Fetch one Property by MLS® ListingId / ListingKey. */
export async function fetchPropertyByMls(
  mls: string,
): Promise<PropTxProperty | null> {
  const key = mls.trim();
  if (!key) return null;
  const lit = odataStringLiteral(key);

  const filters = [
    `ListingId eq ${lit}`,
    `ListingKey eq ${lit}`,
  ];

  const configs = lookupConfigs();
  const row = await runWithAbort(LOOKUP_TIMEOUT_MS, async (signal) => {
    for (const config of configs) {
      if (signal.aborted) throw signal.reason ?? new Error("aborted");
      try {
        const direct = await proptxJson<PropTxProperty>(
          `Property('${key.replace(/'/g, "''")}')`,
          config,
          { signal, timeoutMs: LOOKUP_TIMEOUT_MS },
        );
        if (direct && (mapMlsNumber(direct) || mapListingKey(direct))) {
          return direct;
        }
      } catch (err) {
        if (signal.aborted) throw err;
      }
      for (const filter of filters) {
        if (signal.aborted) throw signal.reason ?? new Error("aborted");
        try {
          const rows = await queryPropertyFilter(filter, config, 5, signal);
          if (rows[0]) return rows[0];
        } catch (err) {
          if (signal.aborted) throw err;
        }
      }
    }
    return null;
  });
  return row ?? null;
}

/**
 * Exact address: street number + name (+ optional city).
 * Returns a single Property only when match is unique / clear.
 */
export async function fetchPropertiesByExactAddress(
  parsed: ParsedExactAddress,
): Promise<PropTxProperty[]> {
  const name = streetNameCore(parsed.streetName);
  const numLit = odataStringLiteral(parsed.streetNumber);
  const nameLit = odataStringLiteral(name);
  const city = cityClause(parsed.city);
  const needle = odataStringLiteral(
    unparsedNeedle({
      streetNumber: parsed.streetNumber,
      streetName: name,
      streetType: parsed.streetType,
    }),
  );

  const filters: string[] = [];
  const baseNumName = `StreetNumber eq ${numLit} and contains(StreetName, ${nameLit})`;
  filters.push(city ? `(${baseNumName}) and ${city}` : baseNumName);
  filters.push(
    city
      ? `contains(UnparsedAddress, ${needle}) and ${city}`
      : `contains(UnparsedAddress, ${needle})`,
  );

  const rows = preferActiveThenNewest(await tryFilters(filters, 8));
  if (rows.length === 0) return [];

  // Prefer exact street number match
  const exact = rows.filter((row) => {
    const sn = String(row.StreetNumber ?? "").trim().toLowerCase();
    return sn === parsed.streetNumber.toLowerCase();
  });
  const pool = exact.length > 0 ? exact : rows;

  if (pool.length === 1) return pool;

  // Unique by normalized unparsed / address line containing number + name
  const needleLower = unparsedNeedle({
    streetNumber: parsed.streetNumber,
    streetName: name,
  }).toLowerCase();
  const tight = pool.filter((row) => {
    const unparsed = String(
      row.UnparsedAddress ??
        [row.StreetNumber, row.StreetName, row.StreetSuffix]
          .filter(Boolean)
          .join(" "),
    ).toLowerCase();
    return (
      unparsed.includes(parsed.streetNumber.toLowerCase()) &&
      unparsed.includes(name.toLowerCase())
    );
  });
  if (tight.length === 1) return tight;
  if (tight.length > 1) {
    // Still ambiguous — return none (don't invent a house)
    return [];
  }
  // Ambiguous without a clear unique — refuse
  if (pool.length > 1 && !needleLower) return [];
  return [];
}

const ADDRESS_HISTORY_TOP = 25;
const ADDRESS_HISTORY_TIMEOUT_MS = 8000;

export class AddressHistoryLookupError extends Error {
  readonly reason: "timeout" | "aborted" | "http" | "network";
  readonly status: number | null;

  constructor(
    reason: "timeout" | "aborted" | "http" | "network",
    message: string,
    status: number | null = null,
  ) {
    super(message);
    this.name = "AddressHistoryLookupError";
    this.reason = reason;
    this.status = status;
  }
}

/**
 * Address-history lookup. Every filter must finish with HTTP 200.
 * An empty 200 is a completed lookup. Timeout, 429, 5xx, 400, 404, and
 * network failures throw so the caller does not stamp the listing.
 */
export async function collectCompletedAddressProperties(options: {
  filters: string[];
  configs: PropTxConfig[];
  timeoutMs: number;
  signal?: AbortSignal;
  top: number;
}): Promise<PropTxProperty[]> {
  if (options.configs.length === 0) {
    throw new AddressHistoryLookupError(
      "network",
      "PropTx credentials not configured",
    );
  }
  for (const config of options.configs) {
    const collected: PropTxProperty[] = [];
    for (const filter of options.filters) {
      if (options.signal?.aborted) {
        throw new AddressHistoryLookupError(
          "timeout",
          "Address history lookup timed out",
        );
      }
      const path = `Property?$filter=${encodeURIComponent(filter)}&$top=${options.top}`;
      try {
        const data = await proptxJson<ODataList>(path, config, {
          signal: options.signal,
          timeoutMs: options.timeoutMs,
        });
        const rows = data.value ?? [];
        if (rows.length) collected.push(...rows);
      } catch (err) {
        if (options.signal?.aborted || (err instanceof Error && err.name === "AbortError")) {
          throw new AddressHistoryLookupError(
            "timeout",
            "Address history lookup timed out",
          );
        }
        if (err instanceof Error && err.name === "TimeoutError") {
          throw new AddressHistoryLookupError(
            "timeout",
            "Address history lookup timed out",
          );
        }
        if (err instanceof PropTxError) {
          throw new AddressHistoryLookupError(
            "http",
            err.message,
            err.status,
          );
        }
        throw new AddressHistoryLookupError(
          "network",
          err instanceof Error ? err.message : "PropTx network error",
        );
      }
    }
    // This credential finished every filter with HTTP 200, including a real empty set.
    return dedupeProperties(collected);
  }
  throw new AddressHistoryLookupError(
    "network",
    "PropTx credentials not configured",
  );
}

/**
 * All Property cycles at an exact civic address (Active + off-market).
 * Unlike fetchPropertiesByExactAddress, does NOT collapse to a single row.
 */
export async function fetchAllPropertiesAtExactAddress(
  parsed: ParsedExactAddress,
  options?: { max?: number },
): Promise<PropTxProperty[]> {
  const max = Math.max(
    1,
    Math.min(options?.max ?? ADDRESS_HISTORY_TOP, ADDRESS_HISTORY_TOP),
  );
  const name = streetNameCore(parsed.streetName);
  const numLit = odataStringLiteral(parsed.streetNumber);
  const nameLit = odataStringLiteral(name);
  const city = cityClause(parsed.city);
  const needle = odataStringLiteral(
    unparsedNeedle({
      streetNumber: parsed.streetNumber,
      streetName: name,
      streetType: parsed.streetType,
    }),
  );

  const filters: string[] = [];
  const baseNumName = `StreetNumber eq ${numLit} and contains(StreetName, ${nameLit})`;
  filters.push(city ? `(${baseNumName}) and ${city}` : baseNumName);
  filters.push(
    city
      ? `contains(UnparsedAddress, ${needle}) and ${city}`
      : `contains(UnparsedAddress, ${needle})`,
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ADDRESS_HISTORY_TIMEOUT_MS);
  let rows: PropTxProperty[];
  try {
    rows = await collectCompletedAddressProperties({
      filters,
      configs: lookupConfigsVowFirst(),
      timeoutMs: ADDRESS_HISTORY_TIMEOUT_MS,
      signal: controller.signal,
      top: Math.max(max, 25),
    });
  } finally {
    clearTimeout(timer);
  }
  if (rows.length === 0) return [];

  const streetNum = parsed.streetNumber.toLowerCase();
  const nameLower = name.toLowerCase();

  const matched = rows.filter((row) => {
    const sn = String(row.StreetNumber ?? "").trim().toLowerCase();
    if (sn && sn !== streetNum) return false;
    const unparsed = String(
      row.UnparsedAddress ??
        [row.StreetNumber, row.StreetName, row.StreetSuffix]
          .filter(Boolean)
          .join(" "),
    ).toLowerCase();
    if (!unparsed.includes(streetNum)) return false;
    if (!unparsed.includes(nameLower) && !String(row.StreetName ?? "")
      .toLowerCase()
      .includes(nameLower)) {
      return false;
    }
    if (parsed.unit) {
      const unit = parsed.unit.toLowerCase();
      const unitNum = String(row.UnitNumber ?? row.ApartmentNumber ?? "")
        .toLowerCase()
        .trim();
      const unparsedHasUnit =
        unparsed.includes(` ${unit}`) ||
        unparsed.includes(`#${unit}`) ||
        unparsed.includes(`-${unit}`) ||
        unparsed.endsWith(` ${unit}`);
      if (unitNum) {
        if (unitNum !== unit) return false;
      } else if (!unparsedHasUnit) {
        return false;
      }
    }
    if (parsed.city) {
      const cityLower = parsed.city.toLowerCase();
      const rowCity = String(row.City ?? "").toLowerCase();
      if (rowCity && !rowCity.includes(cityLower) && !cityLower.includes(rowCity)) {
        return false;
      }
    }
    return true;
  });

  // Newest modification first so upsert prioritizes fresh cycles.
  return preferActiveThenNewest(matched).slice(0, max);
}

/** Street-only: up to 12 listings on that street (+ city when present). */
export async function fetchPropertiesByStreet(
  parsed: ParsedStreetOnly,
  options?: { max?: number },
): Promise<PropTxProperty[]> {
  const max = Math.max(1, Math.min(options?.max ?? STREET_TOP, STREET_TOP));
  const name = streetNameCore(parsed.streetName);
  const nameLit = odataStringLiteral(name);
  const city = cityClause(parsed.city);
  const needle = odataStringLiteral(
    unparsedNeedle({
      streetName: name,
      streetType: parsed.streetType,
    }),
  );

  const filters: string[] = [];
  filters.push(
    city
      ? `contains(StreetName, ${nameLit}) and ${city}`
      : `contains(StreetName, ${nameLit})`,
  );
  filters.push(
    city
      ? `contains(UnparsedAddress, ${needle}) and ${city}`
      : `contains(UnparsedAddress, ${needle})`,
  );

  const rows = preferActiveThenNewest(
    await tryFilters(filters, Math.max(max, 25)),
  );

  // When user typed a street type (Trail vs Crescent), prefer matching suffix.
  if (parsed.streetType) {
    const typeKey = parsed.streetType.toLowerCase();
    const typeAliases: Record<string, string[]> = {
      st: ["st", "street"],
      street: ["st", "street"],
      ave: ["ave", "avenue"],
      avenue: ["ave", "avenue"],
      rd: ["rd", "road"],
      road: ["rd", "road"],
      dr: ["dr", "drive"],
      drive: ["dr", "drive"],
      cres: ["cres", "crescent"],
      crescent: ["cres", "crescent"],
      trail: ["trail", "tr"],
      tr: ["trail", "tr"],
      crt: ["crt", "court", "ct"],
      court: ["crt", "court", "ct"],
      ct: ["ct", "court", "crt"],
      blvd: ["blvd", "boulevard"],
      boulevard: ["blvd", "boulevard"],
      ln: ["ln", "lane"],
      lane: ["ln", "lane"],
      pl: ["pl", "place"],
      place: ["pl", "place"],
    };
    const typeVariants = new Set(typeAliases[typeKey] ?? [typeKey]);
    const typed = rows.filter((row) => {
      const suffix = String(row.StreetSuffix ?? "").toLowerCase();
      const unparsed = String(row.UnparsedAddress ?? "").toLowerCase();
      if (suffix && typeVariants.has(suffix)) return true;
      return [...typeVariants].some(
        (t) => unparsed.includes(` ${t} `) || unparsed.includes(` ${t},`),
      );
    });
    if (typed.length > 0) return typed.slice(0, max);
  }

  return rows.slice(0, max);
}
