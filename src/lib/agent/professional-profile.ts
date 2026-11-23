/**
 * Tenant-wide professional profile rules for agents, including owners who
 * also work as agents. Completion is computed. An incomplete profile is never
 * treated as onboarded, and dashboard access is not derived from it.
 * Jurisdiction is never defaulted to Ontario.
 */
import { parsePhoneColumnsForWrite } from "@/lib/sms/e164";

export const PROFESSIONAL_JURISDICTIONS = [
  {
    id: "CA-ON",
    label: "Ontario",
    license: "reco",
    licenseLabel: "RECO registration number",
    designations: ["Sales Representative", "Salesperson", "Broker", "Broker of Record"],
  },
  {
    id: "CA-BC",
    label: "British Columbia",
    license: "registration",
    licenseLabel: "BCFSA licence number",
    designations: ["Representative", "Associate Broker", "Managing Broker"],
  },
  {
    id: "CA-AB",
    label: "Alberta",
    license: "registration",
    licenseLabel: "RECA licence number",
    designations: ["Associate", "Associate Broker", "Broker"],
  },
  {
    id: "CA-SK",
    label: "Saskatchewan",
    license: "registration",
    licenseLabel: "Registration number",
    designations: ["Salesperson", "Broker", "Branch Manager"],
  },
  {
    id: "CA-MB",
    label: "Manitoba",
    license: "registration",
    licenseLabel: "Registration number",
    designations: ["Salesperson", "Broker"],
  },
  {
    id: "CA-QC",
    label: "Quebec",
    license: "registration",
    licenseLabel: "OACIQ certificate number",
    designations: ["Real Estate Broker", "Agency Executive Officer"],
  },
  {
    id: "CA-NS",
    label: "Nova Scotia",
    license: "registration",
    licenseLabel: "Registration number",
    designations: ["Salesperson", "Broker", "Managing Associate Broker"],
  },
  {
    id: "CA-NB",
    label: "New Brunswick",
    license: "registration",
    licenseLabel: "Registration number",
    designations: ["Salesperson", "Broker", "Managing Associate Broker"],
  },
  {
    id: "CA-PE",
    label: "Prince Edward Island",
    license: "registration",
    licenseLabel: "Registration number",
    designations: ["Salesperson", "Broker"],
  },
  {
    id: "CA-NL",
    label: "Newfoundland and Labrador",
    license: "registration",
    licenseLabel: "Registration number",
    designations: ["Salesperson", "Broker"],
  },
  {
    id: "OTHER",
    label: "Another jurisdiction",
    license: "registration",
    licenseLabel: "Registration / licence number",
    designations: ["Real Estate Agent", "Sales Representative", "Broker"],
  },
] as const;

export type ProfessionalJurisdictionId = (typeof PROFESSIONAL_JURISDICTIONS)[number]["id"];

export type ProfessionalFieldKey =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "designation"
  | "brokerageName"
  | "jurisdiction"
  | "recoLicenseNumber"
  | "recoLicenseExpiresAt"
  | "registrationNumber";

export const PROFESSIONAL_FIELD_LABELS: Record<ProfessionalFieldKey, string> = {
  firstName: "First name",
  lastName: "Last name",
  email: "Professional email",
  phone: "Cell phone number",
  designation: "Professional designation",
  brokerageName: "Brokerage name",
  jurisdiction: "Licensing jurisdiction",
  recoLicenseNumber: "RECO registration number",
  recoLicenseExpiresAt: "RECO registration expiry",
  registrationNumber: "Registration / licence number",
};

const GENERIC_DESIGNATIONS = ["Sales Representative", "Broker", "Real Estate Agent"] as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ProfessionalProfileSnapshot = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  designation: string | null;
  brokerageName: string | null;
  jurisdiction: string | null;
  recoLicenseNumber: string | null;
  recoLicenseExpiresAt: string | null;
  registrationNumber: string | null;
};

export type ProfessionalProfileCompletion = {
  complete: boolean;
  /** True only when every required field is saved. Incomplete profiles stay unboarded. */
  onboarded: boolean;
  missing: ProfessionalFieldKey[];
  fieldErrors: Partial<Record<ProfessionalFieldKey, string>>;
  missingLabels: string[];
  designationOptions: readonly string[];
};

export function isProfessionalJurisdictionId(
  value: string,
): value is ProfessionalJurisdictionId {
  return PROFESSIONAL_JURISDICTIONS.some((item) => item.id === value);
}

export function professionalJurisdictionById(id: ProfessionalJurisdictionId) {
  const match = PROFESSIONAL_JURISDICTIONS.find((item) => item.id === id);
  switch (id) {
    case "CA-ON":
    case "CA-BC":
    case "CA-AB":
    case "CA-SK":
    case "CA-MB":
    case "CA-QC":
    case "CA-NS":
    case "CA-NB":
    case "CA-PE":
    case "CA-NL":
    case "OTHER":
      return match ?? PROFESSIONAL_JURISDICTIONS[0];
    default: {
      const neverId: never = id;
      return neverId;
    }
  }
}

export function designationOptionsForJurisdiction(jurisdiction: string | null): readonly string[] {
  if (!jurisdiction || !isProfessionalJurisdictionId(jurisdiction)) {
    return GENERIC_DESIGNATIONS;
  }
  return professionalJurisdictionById(jurisdiction).designations;
}

export function licenseKindForJurisdiction(
  jurisdiction: string | null,
): "reco" | "registration" | "unselected" {
  if (!jurisdiction || !isProfessionalJurisdictionId(jurisdiction)) return "unselected";
  return professionalJurisdictionById(jurisdiction).license;
}

function trimmed(value: string | null | undefined, max: number): string {
  return (value ?? "").trim().slice(0, max);
}

export function parseProfessionalExpiry(raw: string | null | undefined): string | null {
  const iso = (raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

function phoneIsUsable(phone: string | null | undefined): boolean {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

/**
 * Existing agents keep working while this is incomplete.
 * Callers must not redirect or revoke permissions from the result.
 */
export function evaluateProfessionalAgentProfile(
  snapshot: ProfessionalProfileSnapshot,
): ProfessionalProfileCompletion {
  const fieldErrors: Partial<Record<ProfessionalFieldKey, string>> = {};
  const missing: ProfessionalFieldKey[] = [];
  const jurisdiction = trimmed(snapshot.jurisdiction, 16);
  const known = isProfessionalJurisdictionId(jurisdiction)
    ? professionalJurisdictionById(jurisdiction)
    : null;

  const checks: Array<{ key: ProfessionalFieldKey; ok: boolean; message: string }> = [
    {
      key: "firstName",
      ok: trimmed(snapshot.firstName, 80).length > 0,
      message: "First name is required.",
    },
    {
      key: "lastName",
      ok: trimmed(snapshot.lastName, 80).length > 0,
      message: "Last name is required.",
    },
    {
      key: "email",
      ok: EMAIL_PATTERN.test(trimmed(snapshot.email, 200).toLowerCase()),
      message: "Enter a valid professional email address.",
    },
    {
      key: "phone",
      ok: phoneIsUsable(snapshot.phone),
      message: "Cell phone number is required.",
    },
    {
      key: "designation",
      ok: trimmed(snapshot.designation, 80).length > 0,
      message: "Professional designation is required.",
    },
    {
      key: "brokerageName",
      ok: trimmed(snapshot.brokerageName, 160).length > 0,
      message: "Brokerage name is required.",
    },
  ];

  if (jurisdiction && !known) {
    fieldErrors.jurisdiction = "Choose a licensing jurisdiction.";
  }
  const recoNumber = (snapshot.recoLicenseNumber ?? "").trim();
  const registrationNumber = (snapshot.registrationNumber ?? "").trim();
  const expiryRaw = (snapshot.recoLicenseExpiresAt ?? "").trim();
  if (recoNumber.length > 40) {
    fieldErrors.recoLicenseNumber = "RECO registration number is too long.";
  }
  if (registrationNumber.length > 40) {
    fieldErrors.registrationNumber = "Registration number is too long.";
  }
  if (expiryRaw && !parseProfessionalExpiry(expiryRaw)) {
    fieldErrors.recoLicenseExpiresAt = "Enter a valid registration expiry date.";
  }

  for (const check of checks) {
    if (check.ok) continue;
    missing.push(check.key);
    fieldErrors[check.key] = check.message;
  }

  const complete = missing.length === 0;
  return {
    complete,
    onboarded: complete,
    missing,
    fieldErrors,
    missingLabels: missing.map((key) => PROFESSIONAL_FIELD_LABELS[key]),
    designationOptions: designationOptionsForJurisdiction(known?.id ?? null),
  };
}

export type ProfessionalOnboardingProfile = {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string;
  phoneE164: string;
  designation: string;
  registrationJurisdiction: ProfessionalJurisdictionId | null;
  recoLicenseNumber: string | null;
  recoLicenseExpiresAt: Date | null;
  registrationNumber: string | null;
};

/**
 * New-agent invite gate. Refuses to produce an onboarded profile while any
 * required field is missing. Does not invent a licence number or designation.
 */
export function parseProfessionalOnboarding(
  raw: unknown,
  brokerageName: string | null,
):
  | { ok: true; data: ProfessionalOnboardingProfile }
  | {
      ok: false;
      error: string;
      fieldErrors: Partial<Record<ProfessionalFieldKey, string>>;
      missingLabels: string[];
    } {
  const body =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const text = (key: string) => (typeof body[key] === "string" ? body[key].trim() : "");
  const snapshot: ProfessionalProfileSnapshot = {
    firstName: text("firstName"),
    lastName: text("lastName"),
    email: text("email"),
    phone: text("phone"),
    designation: text("designation"),
    brokerageName,
    jurisdiction: text("jurisdiction"),
    recoLicenseNumber: text("recoLicenseNumber"),
    recoLicenseExpiresAt: text("recoLicenseExpiresAt"),
    registrationNumber: text("registrationNumber"),
  };
  const completion = evaluateProfessionalAgentProfile(snapshot);
  const licenseError = [
    completion.fieldErrors.jurisdiction,
    completion.fieldErrors.recoLicenseNumber,
    completion.fieldErrors.recoLicenseExpiresAt,
    completion.fieldErrors.registrationNumber,
  ].find((message) => message);
  if (!completion.complete || licenseError) {
    const error = completion.missingLabels.length
      ? `Complete the professional profile before this agent is onboarded: ${completion.missingLabels.join(", ")}.`
      : licenseError || "Complete the professional profile before this agent is onboarded.";
    return {
      ok: false,
      error,
      fieldErrors: completion.fieldErrors,
      missingLabels: completion.missingLabels,
    };
  }

  const phone = parsePhoneColumnsForWrite(snapshot.phone ?? "");
  if (!phone.ok || !phone.columns.phone || !phone.columns.phoneE164) {
    return {
      ok: false,
      error: phone.ok ? "Cell phone number is required." : phone.error,
      fieldErrors: {
        phone: phone.ok ? "Cell phone number is required." : phone.error,
      },
      missingLabels: [PROFESSIONAL_FIELD_LABELS.phone],
    };
  }

  const jurisdiction =
    snapshot.jurisdiction && isProfessionalJurisdictionId(snapshot.jurisdiction)
      ? snapshot.jurisdiction
      : null;
  const expiry = parseProfessionalExpiry(snapshot.recoLicenseExpiresAt);
  const recoLicenseNumber = trimmed(snapshot.recoLicenseNumber, 40);
  const registrationNumber = trimmed(snapshot.registrationNumber, 40);
  return {
    ok: true,
    data: {
      firstName: snapshot.firstName!.trim(),
      lastName: snapshot.lastName!.trim(),
      displayName: `${snapshot.firstName!.trim()} ${snapshot.lastName!.trim()}`.replace(/\s+/g, " "),
      email: snapshot.email!.trim().toLowerCase(),
      phone: phone.columns.phone,
      phoneE164: phone.columns.phoneE164,
      designation: snapshot.designation!.trim().slice(0, 80),
      registrationJurisdiction: jurisdiction,
      recoLicenseNumber: recoLicenseNumber || null,
      recoLicenseExpiresAt: expiry ? new Date(`${expiry}T12:00:00.000Z`) : null,
      registrationNumber: registrationNumber || null,
    },
  };
}
