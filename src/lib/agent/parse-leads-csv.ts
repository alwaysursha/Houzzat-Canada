import { parseCsv } from "@/lib/poi/sync/http";
import {
  buildImportHomeAddress,
  classifyImportedLead,
  DEFERRED_IMPORT_REASON,
  guessLeadImportField,
  combineImportDisplayName,
  LEAD_IMPORT_FIELD_LABELS,
  LEAD_IMPORT_MAPPING_NEXT_PHASE_FIELDS,
  LEAD_IMPORT_MAPPING_THIS_IMPORT_FIELDS,
  parseImportLeadType,
  parseImportOptOut,
  parseImportPurchaseTimeframe,
  type ImportDeferredValue,
  type LeadImportDefaultType,
  type LeadImportField,
} from "@/lib/agent/lead-import-classify";
import type { PurchaseTimeframeValue } from "@/lib/agent/timeframe";

export type {
  LeadImportDefaultType,
  LeadImportField,
} from "@/lib/agent/lead-import-classify";

export type ParsedImportLead = {
  name: string;
  email: string;
  phone?: string;
  notes?: string;
  homeAddress?: string;
  purchaseTimeframe?: PurchaseTimeframeValue;
  utmSource?: string;
  leadTypeRaw?: string;
  optedOut: boolean;
  deferred: ImportDeferredValue[];
  row: number;
};

export type LeadImportColumnMapping = {
  header: string;
  field: LeadImportField;
};

export type LeadImportDraft = {
  key: string;
  row: number;
  name: string;
  email: string;
  phone: string;
  notes: string;
  homeAddress: string;
  purchaseTimeframe: PurchaseTimeframeValue | null;
  utmSource: string;
  leadTypeRaw: string;
  optedOut: boolean;
  deferred: ImportDeferredValue[];
  included: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Split CSV into headers + row objects (header keys preserved as in file). */
export function parseLeadsCsvTable(text: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const cleaned = text.replace(/^\uFEFF/, "").trim();
  if (!cleaned) return { headers: [], rows: [] };
  const rows = parseCsv(cleaned);
  if (rows.length === 0) {
    const firstLine = cleaned.split(/\r?\n/).find((line) => line.trim()) ?? "";
    const headers = firstLine
      ? firstLine.split(",").map((h) => h.trim().replace(/^"|"$/g, ""))
      : [];
    return { headers, rows: [] };
  }
  const headers = Object.keys(rows[0] ?? {});
  return { headers, rows };
}

export function suggestLeadImportMapping(
  headers: string[],
): LeadImportColumnMapping[] {
  const taken = new Set<LeadImportField>();
  return headers.map((header) => {
    const field = guessLeadImportField(header, taken);
    if (field !== "skip") taken.add(field);
    return { header, field };
  });
}

export function draftsFromMappedRows(
  rows: Record<string, string>[],
  mapping: LeadImportColumnMapping[],
): LeadImportDraft[] {
  const fieldHeader = new Map<Exclude<LeadImportField, "skip">, string>();
  for (const col of mapping) {
    if (col.field === "skip") continue;
    if (!fieldHeader.has(col.field)) fieldHeader.set(col.field, col.header);
  }

  return rows.map((row, index) => {
    const get = (field: Exclude<LeadImportField, "skip">) => {
      const header = fieldHeader.get(field);
      if (!header) return "";
      return (row[header] ?? "").trim();
    };

    const firstName = get("first_name");
    const lastName = get("last_name");
    const fullName = get("name");
    const name = combineImportDisplayName({
      firstName,
      lastName,
      fullName,
    });
    const email = get("email");
    const phone = get("phone");
    const notes = get("notes");
    const homeAddress =
      buildImportHomeAddress({
        address: get("address"),
        city: get("city"),
        province: get("province"),
        postal: get("postal"),
        country: get("country"),
      }) ?? "";
    const timeframeRaw = get("timeframe");
    const purchaseTimeframe = parseImportPurchaseTimeframe(timeframeRaw);
    const utmSource = get("source");
    const leadTypeRaw = get("lead_type");
    const optedOut = parseImportOptOut(get("opt_out"));
    const deferred: ImportDeferredValue[] = [];

    const tags = get("tags");
    if (tags) {
      deferred.push({
        field: "tags",
        value: tags,
        reason: DEFERRED_IMPORT_REASON,
      });
    }
    const dateCreated = get("date_created");
    if (dateCreated) {
      deferred.push({
        field: "date_created",
        value: dateCreated,
        reason: DEFERRED_IMPORT_REASON,
      });
    }
    const dealCompleted = get("deal_completed");
    if (dealCompleted) {
      deferred.push({
        field: "deal_completed",
        value: dealCompleted,
        reason: DEFERRED_IMPORT_REASON,
      });
    }
    if (timeframeRaw && !purchaseTimeframe) {
      deferred.push({
        field: "timeframe",
        value: timeframeRaw,
        reason:
          "Timeframe not recognized — not stored on the lead or in Notes.",
      });
    }
    const parsedType = parseImportLeadType(leadTypeRaw);
    if (parsedType.kind === "unrecognized") {
      deferred.push({
        field: "lead_type",
        value: parsedType.raw,
        reason: DEFERRED_IMPORT_REASON,
      });
    }

    const empty =
      !name &&
      !email &&
      !phone &&
      !notes &&
      !homeAddress &&
      !utmSource &&
      !leadTypeRaw &&
      deferred.length === 0;

    return {
      key: `row-${index + 2}`,
      row: index + 2,
      name,
      email,
      phone,
      notes,
      homeAddress,
      purchaseTimeframe,
      utmSource,
      leadTypeRaw,
      optedOut,
      deferred,
      included: !empty,
    };
  });
}

export function validateImportDraft(lead: {
  name: string;
  email: string;
}): string[] {
  const issues: string[] = [];
  if (!lead.name.trim()) issues.push("Missing name");
  if (!lead.email.trim()) issues.push("Missing email");
  else if (!EMAIL_RE.test(lead.email.trim())) issues.push("Invalid email");
  return issues;
}

export function validateImportDraftForType(
  lead: { name: string; email: string; leadTypeRaw?: string },
  defaultType: LeadImportDefaultType,
): string[] {
  const issues = validateImportDraft(lead);
  const classification = classifyImportedLead(defaultType, lead.leadTypeRaw);
  if (!classification.ok) issues.push(classification.reason);
  return issues;
}

/**
 * Parse leads CSV. Required after mapping: name (or first+last) and email.
 */
export function parseLeadsCsv(
  text: string,
  defaultType: LeadImportDefaultType = "buyer",
): {
  leads: ParsedImportLead[];
  errors: Array<{ row: number; error: string }>;
} {
  const { headers, rows } = parseLeadsCsvTable(text);
  const mapping = suggestLeadImportMapping(headers);
  const drafts = draftsFromMappedRows(rows, mapping);
  const leads: ParsedImportLead[] = [];
  const errors: Array<{ row: number; error: string }> = [];
  const seen = new Set<string>();

  for (const draft of drafts) {
    if (!draft.included) continue;
    const issues = validateImportDraftForType(draft, defaultType);
    if (issues.length) {
      for (const error of issues) {
        errors.push({ row: draft.row, error });
      }
      continue;
    }
    const normalizedEmail = draft.email.trim().toLowerCase();
    if (seen.has(normalizedEmail)) {
      errors.push({ row: draft.row, error: "Duplicate email in file" });
      continue;
    }
    seen.add(normalizedEmail);
    leads.push(parsedLeadFromDraft(draft));
  }

  return { leads, errors };
}

export function parsedLeadFromDraft(draft: LeadImportDraft): ParsedImportLead {
  return {
    name: draft.name.trim(),
    email: draft.email.trim().toLowerCase(),
    phone: draft.phone.trim() || undefined,
    notes: draft.notes.trim() || undefined,
    homeAddress: draft.homeAddress.trim() || undefined,
    purchaseTimeframe: draft.purchaseTimeframe ?? undefined,
    utmSource: draft.utmSource.trim() || undefined,
    leadTypeRaw: draft.leadTypeRaw.trim() || undefined,
    optedOut: draft.optedOut,
    deferred: draft.deferred,
    row: draft.row,
  };
}

export const LEADS_CSV_TEMPLATE = `name_first,name_last,email,phone,address,city,notes
Jane,Doe,jane@example.com,416-555-0100,123 King St,Kitchener,Open house Sunday
John,Smith,john@example.com,,,Toronto,Referral from partner
`;

export const LEAD_IMPORT_FIELD_OPTION_GROUPS: Array<{
  label: string | null;
  options: Array<{ value: LeadImportField; label: string }>;
}> = [
  {
    label: null,
    options: [{ value: "skip", label: LEAD_IMPORT_FIELD_LABELS.skip }],
  },
  {
    label: "This import",
    options: LEAD_IMPORT_MAPPING_THIS_IMPORT_FIELDS.map((value) => ({
      value,
      label: LEAD_IMPORT_FIELD_LABELS[value],
    })),
  },
  {
    label: "Next phase (not stored yet)",
    options: LEAD_IMPORT_MAPPING_NEXT_PHASE_FIELDS.map((value) => ({
      value,
      label: LEAD_IMPORT_FIELD_LABELS[value],
    })),
  },
];

export const LEAD_IMPORT_FIELD_OPTIONS: Array<{
  value: LeadImportField;
  label: string;
}> = LEAD_IMPORT_FIELD_OPTION_GROUPS.flatMap((group) => group.options);

export const SELLER_CRM_CSV_HEADERS = [
  "name_first",
  "name_last",
  "email",
  "phone",
  "date_created",
  "address",
  "city",
  "state/province",
  "country",
  "zip/postal code",
  "notes",
  "tags",
  "estimated_time_frame",
  "source_ad",
  "deal_completed_date",
] as const;
