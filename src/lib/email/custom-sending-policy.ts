/**
 * Pure rules for tenant custom sending.
 * The email provider (Resend) authenticates the domain of the From address.
 * A return-path subdomain such as send.example.com does not authorize
 * alerts@example.com. Existing mailbox MX, SPF, DKIM, and DMARC stay untouched.
 */

export const CUSTOM_SENDING_CONSTRAINTS = [
  "Add only the records issued for this domain. Do not replace or edit the organizational domain's MX, SPF, DKIM, or DMARC.",
  "Google Workspace (or the current mailbox provider) keeps receiving mail. Reply-To is not a sending identity.",
  "The From address must belong to the domain registered with the email provider. Verifying only the return-path subdomain does not authorize a From address on the parent domain.",
  "Custom sending stays off until that domain is verified and Master Admin enables it. Until then, mail uses the existing HouzzatPRO sender.",
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const RETURN_PATH_LABEL_RE = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type CustomSendingDnsRecord = {
  type: string;
  host: string;
  value: string;
  priority: number | null;
  purpose: string;
};

export type CustomSendingRequest = {
  sendingDomain: string;
  returnPathHost: string;
  senderDisplayName: string;
  fromEmail: string;
  replyToEmail: string;
};

export type PreparedSendingDomain = {
  sendingDomain: string;
  returnPathLabel: string;
  returnPathHost: string;
  senderDisplayName: string;
  fromEmail: string;
  replyToEmail: string;
};

export class CustomSendingError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = "CustomSendingError";
    this.status = status;
    this.code = code;
  }
}

export function normalizeHostname(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^https?:\/\//, "")
    .split("/")[0] ?? "";
}

export function normalizeEmailAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function emailDomain(value: string): string | null {
  const email = normalizeEmailAddress(value);
  if (!EMAIL_RE.test(email)) return null;
  const domain = email.split("@")[1] ?? "";
  return HOST_RE.test(domain) ? domain : null;
}

export function isValidMailbox(value: string): boolean {
  return emailDomain(value) != null;
}

/**
 * Resend verifies one domain and then allows any From address on that domain.
 * The return-path host must be a single label under that same domain.
 */
export function prepareSendingDomain(input: CustomSendingRequest): PreparedSendingDomain {
  const sendingDomain = normalizeHostname(input.sendingDomain);
  const returnPathHost = normalizeHostname(input.returnPathHost);
  const fromEmail = normalizeEmailAddress(input.fromEmail);
  const replyToEmail = normalizeEmailAddress(input.replyToEmail);
  const senderDisplayName = input.senderDisplayName.replace(/[\r\n]+/g, " ").trim();

  if (!HOST_RE.test(sendingDomain)) {
    throw new CustomSendingError(
      "Enter the domain that will be verified for sending.",
      "INVALID_SENDING_DOMAIN",
    );
  }
  if (!isValidMailbox(fromEmail)) {
    throw new CustomSendingError("Enter a valid From email address.", "INVALID_FROM");
  }
  if (!isValidMailbox(replyToEmail)) {
    throw new CustomSendingError("Enter a valid Reply-To email address.", "INVALID_REPLY_TO");
  }
  if (senderDisplayName.length < 2 || senderDisplayName.length > 80) {
    throw new CustomSendingError(
      "Enter a sender name between 2 and 80 characters.",
      "INVALID_SENDER_NAME",
    );
  }

  const fromDomain = emailDomain(fromEmail);
  if (fromDomain !== sendingDomain) {
    throw new CustomSendingError(
      `The From address uses ${fromDomain ?? "an invalid domain"}. The email provider must verify that domain before it can be used as From. Verifying only ${returnPathHost || "a subdomain"} does not authorize it. Register ${fromDomain ?? "the From domain"} and set the return path to a subdomain such as send.${fromDomain ?? "example.com"}.`,
      "FROM_DOMAIN_MUST_BE_VERIFIED",
    );
  }

  if (!returnPathHost.endsWith(`.${sendingDomain}`)) {
    throw new CustomSendingError(
      `The return-path host must be a subdomain of ${sendingDomain}, such as send.${sendingDomain}.`,
      "RETURN_PATH_MISMATCH",
    );
  }
  const returnPathLabel = returnPathHost.slice(0, -(sendingDomain.length + 1));
  if (!RETURN_PATH_LABEL_RE.test(returnPathLabel)) {
    throw new CustomSendingError(
      "The return-path subdomain must be one label, such as send.",
      "INVALID_RETURN_PATH",
    );
  }

  return {
    sendingDomain,
    returnPathLabel,
    returnPathHost,
    senderDisplayName,
    fromEmail,
    replyToEmail,
  };
}

export function formatCustomFromHeader(displayName: string, email: string): string {
  const name = displayName.replace(/[\r\n]+/g, " ").trim();
  if (/[",<>\\]/.test(name)) {
    return `"${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}" <${email}>`;
  }
  return `${name} <${email}>`;
}

const PLATFORM_SENDER_KINDS = new Set([
  "verify_email",
  "verify_email_nudge",
  "password_reset",
  "welcome",
]);

/** Account security mail stays on the existing HouzzatPRO sender. */
export function customFromAppliesToKind(kind: string): boolean {
  return !PLATFORM_SENDER_KINDS.has(kind);
}

export function enabledCustomFromHeader(identity: {
  domainStatus: "NONE" | "PENDING" | "VERIFIED" | "FAILED";
  customSendingEnabled: boolean;
  customDomain: string | null;
  fromEmail: string | null;
  senderDisplayName: string | null;
} | null): string | null {
  if (!identity) return null;
  if (!identity.customSendingEnabled) return null;
  if (identity.domainStatus !== "VERIFIED") return null;
  const fromEmail = identity.fromEmail ? normalizeEmailAddress(identity.fromEmail) : "";
  const domain = emailDomain(fromEmail);
  const sendingDomain = identity.customDomain
    ? normalizeHostname(identity.customDomain)
    : "";
  const name = identity.senderDisplayName?.replace(/[\r\n]+/g, " ").trim() ?? "";
  if (!domain || domain !== sendingDomain || name.length < 2) return null;
  return formatCustomFromHeader(name, fromEmail);
}

export function qualifyDnsHost(name: string, domain: string): string {
  const host = name.trim().replace(/\.$/, "");
  if (host === "@" || host.length === 0) return domain;
  if (host === domain || host.endsWith(`.${domain}`)) return host;
  return `${host}.${domain}`;
}
