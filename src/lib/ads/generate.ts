import { SITE_NAME, SITE_URL } from "@/lib/constants";

export type AdGenerateInput = {
  name: string;
  goal: "BUYER" | "SELLER" | "OPEN_HOUSE" | "VALUATION" | "BRAND";
  platform: "META" | "GOOGLE" | "BOTH";
  sourceType: "LISTING" | "LANDING" | "OPEN_HOUSE" | "AREA" | "VALUATION";
  sourceId: string;
  destinationPath: string;
  city?: string | null;
  community?: string | null;
  addressLine?: string | null;
  listPrice?: number | null;
  beds?: number | null;
  bedsLabel?: string | null;
  baths?: number | null;
  propertyType?: string | null;
  headlineHint?: string | null;
  imageUrls?: string[];
  brokerageName?: string | null;
  mlsNumber?: string | null;
  openHouseWhen?: string | null;
};

export type GeneratedCreativePack = {
  destinationUrl: string;
  utm: {
    utm_source: string;
    utm_medium: string;
    utm_campaign: string;
    utm_content: string;
  };
  complianceNotes: string[];
  meta: {
    headlines: string[];
    primaryTexts: string[];
    descriptions: string[];
  };
  google: {
    headlines: string[];
    descriptions: string[];
  };
  imagePresets: {
    label: string;
    width: number;
    height: number;
    sourceUrl: string | null;
  }[];
};

function money(n: number | null | undefined): string | null {
  if (n == null) return null;
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(n);
}

function slugCampaign(parts: string[]): string {
  return parts
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function buildTrackedUrl(
  destinationPath: string,
  utm: GeneratedCreativePack["utm"],
): string {
  const url = new URL(destinationPath, SITE_URL);
  url.searchParams.set("utm_source", utm.utm_source);
  url.searchParams.set("utm_medium", utm.utm_medium);
  url.searchParams.set("utm_campaign", utm.utm_campaign);
  url.searchParams.set("utm_content", utm.utm_content);
  return url.toString();
}

export function generateCreativePack(
  input: AdGenerateInput,
): GeneratedCreativePack {
  const area =
    [input.community, input.city].filter(Boolean).join(", ") || "the GTA";
  const price = money(input.listPrice);
  const bedsText =
    input.bedsLabel?.trim() ||
    (input.beds != null ? String(input.beds) : null);
  const bedsBaths =
    bedsText != null && input.baths != null
      ? `${bedsText} bed · ${input.baths} bath`
      : null;

  const campaignSlug = slugCampaign([
    input.goal.toLowerCase(),
    input.city ?? "",
    input.community ?? "",
    input.sourceId,
  ]);

  const utm = {
    utm_source: input.platform === "GOOGLE" ? "google" : "meta",
    utm_medium: "paid",
    utm_campaign: campaignSlug,
    utm_content: `${input.sourceType.toLowerCase()}-${input.sourceId}`.slice(
      0,
      80,
    ),
  };

  // For BOTH, default tracked URL uses meta as primary; Google pack notes same campaign.
  if (input.platform === "GOOGLE") {
    utm.utm_source = "google";
  } else if (input.platform === "BOTH") {
    utm.utm_source = "meta";
  }

  const destinationUrl = buildTrackedUrl(input.destinationPath, utm);

  const metaHeadlines = [
    input.addressLine
      ? `${input.addressLine} · ${area}`
      : input.headlineHint ?? `Homes in ${area}`,
    price ? `${price} in ${area}` : `Explore ${area} on ${SITE_NAME}`,
    input.goal === "OPEN_HOUSE"
      ? `Open house${input.openHouseWhen ? ` · ${input.openHouseWhen}` : ""}`
      : input.goal === "VALUATION"
        ? `What's your ${area} home worth?`
        : input.goal === "SELLER"
          ? `Selling in ${area}?`
          : `Find your next home in ${area}`,
    bedsBaths ? `${bedsBaths}${price ? ` · ${price}` : ""}` : null,
    `${SITE_NAME} · GTA listings`,
  ].filter(Boolean) as string[];

  const metaPrimary = [
    input.goal === "VALUATION"
      ? `Get an indicative market range for your ${area} property, then talk strategy with a ${SITE_NAME} advisor.`
      : input.goal === "OPEN_HOUSE"
        ? `Tour this ${area} home at the upcoming open house${input.openHouseWhen ? ` (${input.openHouseWhen})` : ""}. See photos and details on ${SITE_NAME}.`
        : input.goal === "SELLER"
          ? `Thinking of selling in ${area}? Start with a grounded market snapshot on ${SITE_NAME} — no black-box promises.`
          : [
              input.addressLine
                ? `${input.addressLine} in ${area}`
                : `Homes for sale in ${area}`,
              bedsBaths,
              price ? `Listed at ${price}` : null,
              `View details and book a showing on ${SITE_NAME}.`,
            ]
              .filter(Boolean)
              .join(". ") + ".",
    input.mlsNumber
      ? `MLS® ${input.mlsNumber}. Listing courtesy of ${input.brokerageName ?? "the listing brokerage"}.`
      : `Browse verified inventory and neighbourhood context on ${SITE_NAME}.`,
  ];

  const metaDescriptions = [
    price
      ? `${price} · ${area} · See photos & book a tour`
      : `Explore ${area} listings on ${SITE_NAME}`,
    input.goal === "VALUATION"
      ? "Free indicative range · agent follow-up"
      : "Map search · open houses · local insights",
  ];

  const googleHeadlines = [
    ...metaHeadlines.slice(0, 5),
    `${SITE_NAME} ${area}`,
    input.goal === "BUYER" ? `${area} homes for sale` : null,
    input.goal === "SELLER" ? `Sell your ${area} home` : null,
  ]
    .filter(Boolean)
    .map((h) => (h as string).slice(0, 30)) as string[];

  const googleDescriptions = [
    (
      input.addressLine
        ? `${input.addressLine}${price ? ` · ${price}` : ""}. View on ${SITE_NAME}.`
        : `Search ${area} homes on ${SITE_NAME}. Map, open houses, and local context.`
    ).slice(0, 90),
    (
      input.mlsNumber
        ? `MLS® listing details. Brokerage: ${input.brokerageName ?? "see listing"}.`
        : `Factual listing data only — no invented sold prices in ads.`
    ).slice(0, 90),
  ];

  const primaryImage = input.imageUrls?.[0] ?? null;
  const imagePresets = [
    { label: "Meta feed square", width: 1080, height: 1080, sourceUrl: primaryImage },
    { label: "Meta/Google landscape", width: 1200, height: 628, sourceUrl: primaryImage },
    { label: "Meta story / reel", width: 1080, height: 1920, sourceUrl: primaryImage },
    { label: "Google display half", width: 300, height: 250, sourceUrl: primaryImage },
  ];

  const complianceNotes = [
    "Keep claims factual to listing fields only — no invented sold comps or school rankings.",
    input.mlsNumber
      ? `Include MLS® ${input.mlsNumber} and brokerage (${input.brokerageName ?? "listing brokerage"}) where platform policy requires.`
      : "Landing/area ads: avoid implying exclusive inventory not shown on the destination page.",
    "Real estate ads are policy-sensitive on Meta/Google — review before enabling spend.",
    "Destination uses UTM params so Houzzat can attribute leads to this campaign.",
    "Publish APIs create Draft/Paused campaigns only — never auto-spend.",
  ];

  return {
    destinationUrl,
    utm,
    complianceNotes,
    meta: {
      headlines: metaHeadlines.map((h) => h.slice(0, 40)),
      primaryTexts: metaPrimary,
      descriptions: metaDescriptions.map((d) => d.slice(0, 30)),
    },
    google: {
      headlines: googleHeadlines,
      descriptions: googleDescriptions,
    },
    imagePresets,
  };
}

export function creativesToCsv(pack: GeneratedCreativePack): string {
  const rows: string[][] = [
    ["platform", "field", "value"],
    ...pack.meta.headlines.map((v) => ["meta", "headline", v]),
    ...pack.meta.primaryTexts.map((v) => ["meta", "primary_text", v]),
    ...pack.meta.descriptions.map((v) => ["meta", "description", v]),
    ...pack.google.headlines.map((v) => ["google", "headline", v]),
    ...pack.google.descriptions.map((v) => ["google", "description", v]),
    ["both", "destination_url", pack.destinationUrl],
    ["both", "utm_campaign", pack.utm.utm_campaign],
  ];
  return rows
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");
}
