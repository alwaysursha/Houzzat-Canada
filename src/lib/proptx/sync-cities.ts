/**
 * Cities included when syncing PropTx → Neon.
 * Roughly Mississauga ±100 km (GTA), plus London / St. Thomas and Niagara Region.
 *
 * Edit this list, or append via env:
 *   MLS_SYNC_CITIES=Orangeville,Innisfil
 */
export const DEFAULT_MLS_SYNC_CITIES = [
  // Peel / core
  "Mississauga",
  "Brampton",
  "Caledon",

  // Toronto
  "Toronto",

  // York
  "Vaughan",
  "Markham",
  "Richmond Hill",
  "Newmarket",
  "Aurora",
  "King",
  "Whitchurch-Stouffville",
  "East Gwillimbury",
  "Georgina",
  "Bradford West Gwillimbury",

  // Halton
  "Oakville",
  "Burlington",
  "Milton",
  "Halton Hills",

  // Durham
  "Ajax",
  "Pickering",
  "Whitby",
  "Oshawa",
  "Clarington",
  "Uxbridge",
  "Scugog",

  // Hamilton / Niagara fringe
  "Hamilton",
  "Grimsby",

  // London / St. Thomas area
  "London",
  "St. Thomas",
  "St Thomas",
  "Strathroy-Caradoc",
  "Middlesex Centre",
  "Thames Centre",
  "Central Elgin",
  "Aylmer",

  // Niagara Region
  "Niagara Falls",
  "St. Catharines",
  "St Catharines",
  "Niagara-on-the-Lake",
  "Niagara on the Lake",
  "Welland",
  "Thorold",
  "Pelham",
  "Lincoln",
  "West Lincoln",
  "Port Colborne",
  "Fort Erie",
  "Wainfleet",

  // West fringe
  "Guelph",
  "Cambridge",
  "Kitchener",
  "Waterloo",
  "Orangeville",

  // North fringe
  "Barrie",
  "Innisfil",
] as const;

/** Normalize for case-insensitive exact / prefix match (e.g. "Toronto C08"). */
export function normalizeCityName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
}

/**
 * Allowlist = defaults + optional comma-separated MLS_SYNC_CITIES extras.
 */
export function getMlsSyncCities(): string[] {
  const extras =
    process.env.MLS_SYNC_CITIES?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  const merged = [...DEFAULT_MLS_SYNC_CITIES, ...extras];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const city of merged) {
    const key = normalizeCityName(city);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(city.trim());
  }
  return out;
}

/**
 * True when listing city is in the sync allowlist.
 * "Toronto C01" matches allowlist entry "Toronto".
 * "King" does not match "Kingston".
 */
export function cityAllowedForMlsSync(
  city: string | null | undefined,
  allowlist: string[] = getMlsSyncCities(),
): boolean {
  if (!city?.trim()) return false;
  const needle = normalizeCityName(city);
  return allowlist.some((allowed) => {
    const hay = normalizeCityName(allowed);
    return needle === hay || needle.startsWith(`${hay} `);
  });
}
