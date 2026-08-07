import { parseCsv } from "@/lib/poi/sync/http";

export type ParsedImportLead = {
  name: string;
  email: string;
  phone?: string;
  notes?: string;
  row: number;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeHeader(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function pick(
  row: Record<string, string>,
  aliases: string[],
): string | undefined {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(row)) {
    map.set(normalizeHeader(key), value.trim());
  }
  for (const alias of aliases) {
    const value = map.get(alias);
    if (value) return value;
  }
  return undefined;
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
  const rows = parseCsv(text);
  const leads: ParsedImportLead[] = [];
  const errors: Array<{ row: number; error: string }> = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const rowNum = index + 2; // header is row 1
    const name =
      pick(row, ["name", "full_name", "fullname_name", "client_name", "contact"]) ??
      "";
    const email =
      pick(row, ["email", "e_mail", "email_address", "mail"]) ?? "";
    const phone = pick(row, [
      "phone",
      "mobile",
      "cell",
      "telephone",
      "phone_number",
    ]);
    const notes = pick(row, ["notes", "note", "comments", "comment"]);

    if (!name && !email) {
      return;
    }
    if (!name) {
      errors.push({ row: rowNum, error: "Missing name" });
      return;
    }
    if (!email || !EMAIL_RE.test(email)) {
      errors.push({ row: rowNum, error: "Invalid or missing email" });
      return;
    }

    const normalizedEmail = email.toLowerCase();
    if (seen.has(normalizedEmail)) {
      errors.push({ row: rowNum, error: "Duplicate email in file" });
      return;
    }
    seen.add(normalizedEmail);

    leads.push({
      name,
      email: normalizedEmail,
      phone: phone || undefined,
      notes: notes || undefined,
      row: rowNum,
    });
  });

  return { leads, errors };
}

export const LEADS_CSV_TEMPLATE = `name,email,phone,notes
Jane Doe,jane@example.com,416-555-0100,Open house Sunday
John Smith,john@example.com,,Referral from partner
`;
