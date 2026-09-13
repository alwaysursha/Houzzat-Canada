/**
 * Phase 1 Advanced Import — classification, aliases, and safe field mapping.
 * No Prisma. No Area Watch / Saved Search / tags persistence.
 */
import { resolveLeadIntent } from "@/lib/agent/lead-intent";
import {
  isPurchaseTimeframe,
  type PurchaseTimeframeValue,
} from "@/lib/agent/timeframe";
import type { LeadIntent } from "@prisma/client";

export const LEAD_IMPORT_DEFAULT_TYPES = [
  "buyer",
  "seller",
  "both",
  "detect",
] as const;

export type LeadImportDefaultType = (typeof LEAD_IMPORT_DEFAULT_TYPES)[number];

export const LEAD_IMPORT_PERSISTED_FIELDS = [
  "name",
  "first_name",
  "last_name",
  "email",
  "phone",
  "address",
  "city",
  "province",
  "country",
  "postal",
  "notes",
  "timeframe",
  "source",
  "lead_type",
  "opt_out",
] as const;

export const LEAD_IMPORT_DEFERRED_FIELDS = [
  "tags",
  "date_created",
  "deal_completed",
] as const;

export type LeadImportPersistedField =
  (typeof LEAD_IMPORT_PERSISTED_FIELDS)[number];

export type LeadImportDeferredField =
  (typeof LEAD_IMPORT_DEFERRED_FIELDS)[number];

export type LeadImportField =
  | LeadImportPersistedField
  | LeadImportDeferredField
  | "skip";

/** Visible mapping destinations. Next-phase fields are labeled, not persisted. */
export const LEAD_IMPORT_FIELD_LABELS: Record<LeadImportField, string> = {
  skip: "Ignore",
  first_name: "First Name",
  last_name: "Last Name",
  name: "Full Name",
  email: "Email",
  phone: "Phone",
  address: "Address",
  city: "City",
  province: "Province/State",
  country: "Country",
  postal: "Postal/ZIP",
  notes: "Notes",
  lead_type: "Lead Type",
  tags: "Tags",
  timeframe: "Estimated Time Frame",
  source: "Source/Ad",
  date_created: "Date Created",
  deal_completed: "Deal Completed Date",
  opt_out: "Unsubscribe/Opt-Out",
};

export const LEAD_IMPORT_MAPPING_THIS_IMPORT_FIELDS = [
  "first_name",
  "last_name",
  "name",
  "email",
  "phone",
  "address",
  "city",
  "province",
  "country",
  "postal",
  "notes",
  "lead_type",
  "tags",
  "timeframe",
  "source",
  "date_created",
  "deal_completed",
  "opt_out",
] as const satisfies readonly Exclude<LeadImportField, "skip">[];

export const LEAD_IMPORT_MAPPING_NEXT_PHASE_FIELDS = [] as const;

export const DETECT_WITHOUT_MAPPED_COLUMN_MESSAGE =
  "Detect from CSV needs a Lead Type column. Map a CSV column to Lead Type below, or choose Buyer, Seller, or Buyer + Seller.";

export const DETECT_EMPTY_LEAD_TYPE_REASON =
  "Map a Lead Type column, or choose Buyer, Seller, or Buyer + Seller.";

export function mappingIncludesLeadType(
  mapping: ReadonlyArray<{ field: LeadImportField }>,
): boolean {
  return mapping.some((col) => col.field === "lead_type");
}

export function initialImportDefaultLeadType(
  mapping: ReadonlyArray<{ field: LeadImportField }>,
): LeadImportDefaultType {
  return mappingIncludesLeadType(mapping) ? "detect" : "buyer";
}

export type ImportLeadTypeKind = "buyer" | "seller" | "both";

export type ParsedImportLeadType =
  | { kind: "supported"; type: ImportLeadTypeKind }
  | { kind: "unrecognized"; raw: string }
  | { kind: "empty" };

export type ImportClassification =
  | {
      ok: true;
      isBuyer: boolean;
      isSeller: boolean;
      intent: LeadIntent;
    }
  | {
      ok: false;
      reason: string;
      raw: string | null;
    };

export type ImportDeferredValue = {
  field: LeadImportDeferredField | "lead_type" | "timeframe";
  value: string;
  reason: string;
};

export const LEAD_IMPORT_FIELD_ALIASES: Record<
  Exclude<LeadImportField, "skip">,
  string[]
> = {
  name: [
    "name",
    "full_name",
    "fullname",
    "client_name",
    "contact",
    "contact_name",
  ],
  first_name: [
    "name_first",
    "first_name",
    "firstname",
    "fname",
    "first",
    "given_name",
  ],
  last_name: [
    "name_last",
    "last_name",
    "lastname",
    "lname",
    "last",
    "surname",
    "family_name",
  ],
  email: ["email", "e_mail", "email_address", "mail", "emailaddress"],
  phone: [
    "phone",
    "mobile",
    "cell",
    "telephone",
    "phone_number",
    "mobile_phone",
    "cell_phone",
  ],
  address: [
    "address",
    "street",
    "street_address",
    "property_address",
    "home_address",
    "street1",
    "address_line",
  ],
  city: ["city", "town", "municipality"],
  province: ["state", "province", "state_province", "region"],
  country: ["country", "nation"],
  postal: [
    "zip",
    "zipcode",
    "zip_code",
    "postal",
    "postal_code",
    "zip_postal_code",
    "zip_postal",
  ],
  notes: ["notes", "note", "comments", "comment", "memo"],
  tags: ["tags", "labels", "contact_tags", "tag"],
  timeframe: [
    "estimated_time_frame",
    "estimated_timeframe",
    "timeframe",
    "time_frame",
    "purchase_timeframe",
  ],
  source: [
    "source",
    "source_ad",
    "lead_source",
    "original_source",
    "ad_source",
  ],
  lead_type: [
    "lead_type",
    "contact_type",
    "type",
    "buyer_seller",
    "leadtype",
  ],
  date_created: [
    "date_created",
    "created_date",
    "created_at",
    "registration_date",
    "date_added",
  ],
  deal_completed: [
    "deal_completed_date",
    "closed_date",
    "close_date",
    "closing_date",
    "sold_date",
  ],
  opt_out: [
    "unsubscribe",
    "unsubscribed",
    "opt_out",
    "opted_out",
    "do_not_email",
    "email_opt_out",
    "dnc",
  ],
};

const FIELD_GUESS_ORDER: Exclude<LeadImportField, "skip">[] = [
  "email",
  "first_name",
  "last_name",
  "phone",
  "postal",
  "address",
  "city",
  "province",
  "country",
  "opt_out",
  "date_created",
  "deal_completed",
  "timeframe",
  "source",
  "lead_type",
  "tags",
  "notes",
  "name",
];

export function normalizeImportHeader(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function guessLeadImportField(
  header: string,
  taken: Set<LeadImportField>,
): LeadImportField {
  const normalized = normalizeImportHeader(header);
  for (const field of FIELD_GUESS_ORDER) {
    if (taken.has(field)) continue;
    if (LEAD_IMPORT_FIELD_ALIASES[field].includes(normalized)) return field;
  }

  for (const field of FIELD_GUESS_ORDER) {
    if (taken.has(field)) continue;
    if (softMatchImportField(field, normalized)) return field;
  }
  return "skip";
}

function softMatchImportField(
  field: Exclude<LeadImportField, "skip">,
  normalized: string,
): boolean {
  switch (field) {
    case "email":
      return normalized.includes("mail") && !normalized.includes("opt");
    case "first_name":
      return (
        (normalized.includes("first") && normalized.includes("name")) ||
        normalized === "fname"
      );
    case "last_name":
      return (
        (normalized.includes("last") && normalized.includes("name")) ||
        normalized === "lname" ||
        normalized.includes("surname")
      );
    case "phone":
      return (
        normalized.includes("phone") ||
        normalized.includes("mobile") ||
        normalized.includes("cell")
      );
    case "address":
      return (
        normalized.includes("address") ||
        (normalized.includes("street") && !normalized.includes("city"))
      );
    case "city":
      return normalized === "city" || normalized.endsWith("_city");
    case "province":
      return normalized.includes("province") || normalized.includes("state");
    case "country":
      return normalized.includes("country");
    case "postal":
      return (
        normalized.includes("postal") ||
        normalized.includes("zipcode") ||
        normalized === "zip"
      );
    case "notes":
      return normalized.includes("note") || normalized.includes("comment");
    case "tags":
      return normalized.includes("tag") || normalized.includes("label");
    case "timeframe":
      return normalized.includes("timeframe") || normalized.includes("time_frame");
    case "source":
      return normalized.includes("source") && !normalized.includes("resource");
    case "lead_type":
      return normalized.includes("lead_type") || normalized.includes("contact_type");
    case "date_created":
      return (
        normalized.includes("created") &&
        (normalized.includes("date") || normalized.includes("at"))
      );
    case "deal_completed":
      return (
        normalized.includes("deal") ||
        normalized.includes("closed") ||
        normalized.includes("closing")
      );
    case "opt_out":
      return (
        normalized.includes("unsub") ||
        normalized.includes("opt_out") ||
        normalized.includes("do_not_email")
      );
    case "name":
      return (
        normalized.includes("name") &&
        !normalized.includes("first") &&
        !normalized.includes("last") &&
        !normalized.includes("user")
      );
    default: {
      const _never: never = field;
      return _never;
    }
  }
}

export function combineImportDisplayName(input: {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
}): string {
  const first = input.firstName?.trim() ?? "";
  const last = input.lastName?.trim() ?? "";
  const combined = [first, last].filter(Boolean).join(" ").trim();
  if (combined) return combined;
  return input.fullName?.trim() ?? "";
}

export function buildImportHomeAddress(input: {
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postal?: string | null;
  country?: string | null;
}): string | null {
  const street = input.address?.trim() ?? "";
  const city = input.city?.trim() ?? "";
  const province = input.province?.trim() ?? "";
  const postal = input.postal?.trim().toUpperCase() ?? "";
  const country = input.country?.trim() ?? "";

  const cityLine = [city, province, postal].filter(Boolean).join(" ").trim();
  const parts = [street, cityLine, country].filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(", ");
}

export function parseImportLeadType(raw: string | null | undefined): ParsedImportLeadType {
  const value = raw?.trim() ?? "";
  if (!value) return { kind: "empty" };
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    normalized === "buyer seller" ||
    normalized === "buyer + seller" ||
    normalized === "buyer+seller" ||
    normalized === "buyer and seller" ||
    normalized === "both" ||
    normalized === "b s"
  ) {
    return { kind: "supported", type: "both" };
  }
  if (normalized === "seller" || normalized === "seller lead") {
    return { kind: "supported", type: "seller" };
  }
  if (normalized === "buyer" || normalized === "buyer lead") {
    return { kind: "supported", type: "buyer" };
  }
  return { kind: "unrecognized", raw: value };
}

export function classifyImportedLead(
  defaultType: LeadImportDefaultType,
  rawType?: string | null,
): ImportClassification {
  switch (defaultType) {
    case "buyer":
      return {
        ok: true,
        isBuyer: true,
        isSeller: false,
        intent: resolveLeadIntent({ isBuyer: true, isSeller: false }),
      };
    case "seller":
      return {
        ok: true,
        isBuyer: false,
        isSeller: true,
        intent: resolveLeadIntent({ isBuyer: false, isSeller: true }),
      };
    case "both":
      return {
        ok: true,
        isBuyer: true,
        isSeller: true,
        intent: resolveLeadIntent({ isBuyer: true, isSeller: true }),
      };
    case "detect": {
      const parsed = parseImportLeadType(rawType);
      if (parsed.kind === "supported") {
        return classifyImportedLead(
          parsed.type === "both" ? "both" : parsed.type,
        );
      }
      if (parsed.kind === "empty") {
        return {
          ok: false,
          reason: DETECT_EMPTY_LEAD_TYPE_REASON,
          raw: null,
        };
      }
      return {
        ok: false,
        reason: `Lead type “${parsed.raw}” is not stored in this phase.`,
        raw: parsed.raw,
      };
    }
    default: {
      const _never: never = defaultType;
      return _never;
    }
  }
}

export function parseImportPurchaseTimeframe(
  raw: string | null | undefined,
): PurchaseTimeframeValue | null {
  const value = raw?.trim() ?? "";
  if (!value) return null;
  if (isPurchaseTimeframe(value)) return value;

  const normalized = value
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    normalized === "now" ||
    normalized === "asap" ||
    normalized === "immediately" ||
    normalized === "ready now"
  ) {
    return "NOW";
  }
  if (
    normalized.includes("1-3") ||
    normalized.includes("1 to 3") ||
    normalized.includes("0-3") ||
    normalized.includes("1 3 month")
  ) {
    return "ONE_TO_THREE_MONTHS";
  }
  if (
    normalized.includes("6-12") ||
    normalized.includes("6 to 12") ||
    normalized.includes("6 12")
  ) {
    return "SIX_TO_TWELVE_MONTHS";
  }
  if (
    normalized.includes("12+") ||
    normalized.includes("12 plus") ||
    normalized.includes("12 month") ||
    normalized.includes("1 year")
  ) {
    return "TWELVE_PLUS_MONTHS";
  }
  return null;
}

export function parseImportOptOut(raw: string | null | undefined): boolean {
  const value = raw?.trim().toLowerCase() ?? "";
  if (!value) return false;
  const normalized = value.replace(/[^a-z0-9]+/g, " ").trim();
  if (
    normalized === "false" ||
    normalized === "no" ||
    normalized === "n" ||
    normalized === "0"
  ) {
    return false;
  }
  return (
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "y" ||
    normalized === "1" ||
    normalized === "unsubscribe" ||
    normalized === "unsubscribed" ||
    normalized.includes("opt out") ||
    normalized.includes("do not email") ||
    normalized === "dnc"
  );
}

export function shouldSetImportConsent(input: {
  asserted: boolean;
  optedOut: boolean;
}): boolean {
  return input.asserted && !input.optedOut;
}

export function isLeadImportDeferredField(
  field: LeadImportField,
): field is LeadImportDeferredField {
  return (
    field === "tags" ||
    field === "date_created" ||
    field === "deal_completed"
  );
}

export const DEFERRED_IMPORT_REASON =
  "Recognized — stored as import provenance, not Notes.";
