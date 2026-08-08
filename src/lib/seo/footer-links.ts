import {
  GTA_CITY_CENTROIDS,
  homesForSalePath,
  slugifySegment,
} from "@/lib/geo/area-paths";
import {
  DEFAULT_HOMEPAGE_CITIES,
  MARKET_REGIONS,
  resolveRegionFromCity,
  type MarketRegion,
} from "@/lib/geo/regions";

export type SeoFooterLink = {
  label: string;
  href: string;
};

export type SeoFooterColumn = {
  title: string;
  links: SeoFooterLink[];
};

export type SeoFooterLocation = {
  city: string | null;
  community?: string | null;
};

function uniqueCities(cities: string[], prefer: string | null, limit = 8) {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (city: string) => {
    const key = city.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(city.trim());
  };
  if (prefer) push(prefer);
  for (const city of cities) {
    push(city);
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

function saleSearch(city: string, extras: Record<string, string> = {}) {
  const params = new URLSearchParams({
    city,
    status: "ACTIVE",
    transactionType: "SALE",
    ...extras,
  });
  return `/search?${params.toString()}`;
}

function leaseSearch(city: string, extras: Record<string, string> = {}) {
  const params = new URLSearchParams({
    city,
    status: "ACTIVE",
    transactionType: "LEASE",
    ...extras,
  });
  return `/search?${params.toString()}`;
}

/** Infer city display name from a homes-for-sale or listing URL slug. */
export function cityFromPathSlug(slug: string | null | undefined): string | null {
  if (!slug?.trim()) return null;
  const key = slugifySegment(slug);
  const known = GTA_CITY_CENTROIDS[key];
  if (known) return known.name;

  for (const region of Object.values(MARKET_REGIONS)) {
    for (const city of region.cities) {
      if (slugifySegment(city) === key) return city;
    }
  }
  for (const city of DEFAULT_HOMEPAGE_CITIES) {
    if (slugifySegment(city) === key) return city;
  }
  return null;
}

/** Pull city from listing slug like `123-main-st-pickering`. */
export function cityFromListingSlug(slug: string | null | undefined): string | null {
  if (!slug?.trim()) return null;
  const normalized = slugifySegment(slug);
  const candidates = [
    ...Object.keys(GTA_CITY_CENTROIDS),
    ...Object.values(MARKET_REGIONS).flatMap((r) =>
      r.cities.map((c) => slugifySegment(c)),
    ),
    ...DEFAULT_HOMEPAGE_CITIES.map((c) => slugifySegment(c)),
  ]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const key of new Set(candidates)) {
    if (normalized === key || normalized.endsWith(`-${key}`)) {
      return cityFromPathSlug(key);
    }
  }
  return null;
}

export function parseLocationFromPathname(pathname: string): SeoFooterLocation {
  const parts = pathname.split("/").filter(Boolean);

  if (parts[0] === "homes-for-sale" && parts[1]) {
    return {
      city: cityFromPathSlug(parts[1]),
      community: parts[2] ? parts[2].replace(/-/g, " ") : null,
    };
  }

  if (parts[0] === "listing" && parts[1] && parts.length >= 2) {
    // `/listing/{slug}/{mls}` or legacy `/listing/{mls}`
    const maybeSlug = parts.length >= 3 ? parts[1]! : null;
    return { city: cityFromListingSlug(maybeSlug), community: null };
  }

  return { city: null, community: null };
}

export function buildSeoFooterColumns(input: {
  city: string | null;
  community?: string | null;
  region?: MarketRegion;
}): SeoFooterColumn[] {
  const { region, browseCity } = input.region
    ? { region: input.region, browseCity: input.city }
    : resolveRegionFromCity(input.city);

  const primary = browseCity ?? region.cities[0] ?? "Toronto";
  const cities = uniqueCities(region.cities, primary, 8);
  const focusCities = cities.slice(0, 6);

  const homes: SeoFooterLink[] = focusCities.map((city) => ({
    label: `Homes for sale in ${city}`,
    href: homesForSalePath({ city }),
  }));

  const rentals: SeoFooterLink[] = focusCities.map((city) => ({
    label: `${city} rentals`,
    href: leaseSearch(city),
  }));

  const condos: SeoFooterLink[] = focusCities.map((city) => ({
    label: `${city} condos for sale`,
    href: saleSearch(city, { propertyTypes: "CONDO_APT,CONDO_TOWNHOUSE" }),
  }));

  const intent: SeoFooterLink[] = [
    {
      label: `New listings in ${primary}`,
      href: saleSearch(primary, { sort: "newest" }),
    },
    {
      label: `Open houses in ${primary}`,
      href: saleSearch(primary, { openHouseOnly: "1" }),
    },
    {
      label: `${primary} homes under $800K`,
      href: saleSearch(primary, { maxPrice: "800000" }),
    },
    {
      label: `${primary} homes under $1.2M`,
      href: saleSearch(primary, { maxPrice: "1200000" }),
    },
    {
      label: `${primary} detached homes`,
      href: saleSearch(primary, { propertyTypes: "DETACHED" }),
    },
    {
      label: `${primary} townhouses`,
      href: saleSearch(primary, { propertyTypes: "TOWNHOUSE,CONDO_TOWNHOUSE" }),
    },
    {
      label: `${region.label} market search`,
      href: `/search?cities=${encodeURIComponent(cities.join("|"))}&status=ACTIVE&transactionType=SALE`,
    },
  ];

  if (input.community && primary) {
    intent.unshift({
      label: `Homes in ${titleCaseCommunity(input.community)}, ${primary}`,
      href: homesForSalePath({ city: primary, community: input.community }),
    });
  }

  return [
    { title: "Homes for sale", links: homes },
    { title: "Rentals", links: rentals },
    { title: "Condos", links: condos },
    { title: "Popular searches", links: intent.slice(0, 8) },
  ];
}

function titleCaseCommunity(value: string) {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
