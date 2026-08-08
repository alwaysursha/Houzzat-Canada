import { parseCsv } from "@/lib/poi/sync/http";

export type ParsedImportLead = {
  name: string;
  email: string;
  phone?: string;
  notes?: string;
  row: number;
};

export type LeadImportField = "name" | "email" | "phone" | "notes" | "skip";

export type LeadImportColumnMapping = {
  header: string;
  field: LeadImportField;
};

export type LeadImportDraft = {
  /** Stable client key */
  key: string;
  row: number;
  name: string;
  email: string;
  phone: string;
  notes: string;
  included: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FIELD_ALIASES: Record<Exclude<LeadImportField, "skip">, string[]> = {
  name: ["name", "full_name", "fullname_name", "client_name", "contact", "contact_name"],
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
  notes: ["notes", "note", "comments", "comment", "memo", "description"],
};

function normalizeHeader(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function guessField(
  header: string,
  taken: Set<LeadImportField>,
): LeadImportField {
  const normalized = normalizeHeader(header);
  for (const field of ["email", "name", "phone", "notes"] as const) {
    if (taken.has(field)) continue;
    if (FIELD_ALIASES[field].includes(normalized)) return field;
  }
  // Soft contains match when exact alias missed
  for (const field of ["email", "name", "phone", "notes"] as const) {
    if (taken.has(field)) continue;
    if (
      (field === "email" && normalized.includes("mail")) ||
      (field === "phone" &&
        (normalized.includes("phone") ||
          normalized.includes("mobile") ||
          normalized.includes("cell"))) ||
      (field === "name" && normalized.includes("name")) ||
      (field === "notes" &&
        (normalized.includes("note") || normalized.includes("comment")))
    ) {
      return field;
    }
  }
  return "skip";
}

/** Split CSV into headers + row objects (header keys preserved as in file). */
export function parseLeadsCsvTable(text: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const cleaned = text.replace(/^\uFEFF/, "").trim();
  if (!cleaned) return { headers: [], rows: [] };
  const rows = parseCsv(cleaned);
  if (rows.length === 0) {
    const firstLine = cleaned.split(/\r?\n/).find(Boolean) ?? "";
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
    const field = guessField(header, taken);
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
    const name = get("name");
    const email = get("email");
    const phone = get("phone");
    const notes = get("notes");
    const empty = !name && !email && !phone && !notes;
    return {
      key: `row-${index + 2}`,
      row: index + 2,
      name,
      email,
      phone,
      notes,
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

/**
 * Parse leads CSV. Required columns: name, email.
 * Optional: phone, notes.
 * Accepts common header aliases (full_name, e_mail, mobile, etc.).
 */
export function parseLeadsCsv(text: string): {
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
    if (!draft.name && !draft.email && !draft.phone && !draft.notes) continue;
    const issues = validateImportDraft(draft);
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
    leads.push({
      name: draft.name.trim(),
      email: normalizedEmail,
      phone: draft.phone.trim() || undefined,
      notes: draft.notes.trim() || undefined,
      row: draft.row,
    });
  }

  return { leads, errors };
}

export const LEADS_CSV_TEMPLATE = `name,email,phone,notes
Jane Doe,jane@example.com,416-555-0100,Open house Sunday
John Smith,john@example.com,,Referral from partner
`;

export const LEAD_IMPORT_FIELD_OPTIONS: Array<{
  value: LeadImportField;
  label: string;
}> = [
  { value: "skip", label: "Ignore" },
  { value: "name", label: "Name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "notes", label: "Notes" },
];
