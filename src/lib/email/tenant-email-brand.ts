/**
 * Phase 1 / 3B — tenant-aware chrome for existing customer-facing emails.
 *
 * Global: TENANT_EMAIL_BRANDING=on (default off).
 * Allowlist: TENANT_EMAIL_BRANDING_WORKSPACE_IDS (comma/whitespace-separated).
 *
 * When global off: resolveTenantEmailBrand returns null; callers keep legacy layout.
 * When global on: only allowlisted workspace IDs resolve (unset/empty allowlist → none).
 * Brand is always loaded for the recipient workspace only — never another tenant.
 *
 * From addresses are never overridden here (custom domains stay VERIFIED-gated later).
 *
 * Phase 3B — premium personal agent signature (User.image + ACTIVE membership)
 * via Phase 3A photo resolver. Designation omitted until a verified per-agent
 * field exists (workspace WPI designation is not per-agent).
 *
 * Phase 3D.4.2 — prefer verified AgentEmailHeadshot thumbnail when association
 * matches current User.image; otherwise sanitized canonical User.image.
 *
 * Future tenant-branding task (explicitly out of Phase 1):
 * - Customer verification email (`renderVerifyEmail`)
 * - Welcome email (`renderWelcomeEmail`)
 * - Password-reset email (`password-reset-email`)
 * HouzzatPRO platform administration / Book Demo / offer / activation emails
 * remain platform-branded and must not consume this resolver.
 */

import type {
  WorkspaceBranding,
  WorkspaceEmailIdentity,
} from "@prisma/client";
import { SITE_URL } from "@/lib/constants";
import { escapeAttr, escapeHtml } from "@/lib/email/layout";
import { isWorkspaceIdAllowlisted } from "@/lib/email/workspace-id-allowlist";
import { prisma } from "@/lib/prisma";
import { verifiedActiveMembership } from "@/lib/tenancy/agent-photo";
import {
  resolveVerifiedAgentEmailSignaturePhoto,
  type AgentEmailHeadshotAssociationView,
} from "@/lib/tenancy/branding-assets/email-headshot-resolve";
import { validateOptionalBrandColor } from "@/lib/tenancy/brand-colors";
import { resolveCanonicalPublicOrigin } from "@/lib/tenancy/canonical-public-origin";
import { buildNeutralTenantBrand } from "@/lib/tenancy/neutral-tenant-brand";
import { workspaceBrandingRowToBrand } from "@/lib/tenancy/resolve-workspace-brand";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIGNATURE_MARKER = 'data-houzzat-agent-signature="1"';
const SIGNATURE_PHOTO_PX = 80;
const SAFE_SIGNATURE_ACCENT = "#0F6B4C";

export type TenantEmailAgentIdentity = {
  userId: string;
  name: string;
  /** Used for Reply-To only — never rendered in the visible signature. */
  email: string | null;
  phone: string | null;
  /** Canonical User.image; sanitized via Phase 3A PERSONAL resolver. */
  image?: string | null;
  /**
   * Per-agent designation only. Null in Phase 3B — do not use workspace-level
   * WorkspaceProfessionalIdentity.agentDesignation (not per-agent).
   */
  designation?: string | null;
};

export type TenantEmailBrand = {
  workspaceId: string;
  displayName: string;
  logoUrl: string | null;
  primaryColor: string;
  websiteUrl: string;
  contactEmail: string | null;
  contactPhone: string | null;
  /** Safe Reply-To only. Never a From override. */
  replyTo: string | null;
  /** Always null — From stays on global verified Houzzat streams until domains are verified. */
  fromOverride: null;
  agent: TenantEmailAgentIdentity | null;
  signatureHtml: string;
  signatureText: string;
  footerNote: string;
  poweredByHouzzatPro: boolean;
};

/** Optional fields spread into email template renderers / emailLayout. */
export type EmailBrandChrome = {
  brandLabel?: string | null;
  brandLogoUrl?: string | null;
  brandPrimaryColor?: string | null;
  brandWebsiteUrl?: string | null;
  footerNote?: string | null;
  agentSignatureHtml?: string | null;
  agentSignatureText?: string | null;
  /** Subtitle helper e.g. agent message "from your X agent". */
  agentFromLabel?: string | null;
};

export type TenantEmailBrandResolveInput = {
  workspaceId: string;
  /** Prefer this agent when they are a member of the same workspace. */
  preferredAgentUserId?: string | null;
  leadId?: string | null;
  customerId?: string | null;
};

export type TenantEmailProfessionalIdentity = {
  brokerageRegisteredName: string | null;
};

export type TenantEmailBrandDeps = {
  loadBranding: (workspaceId: string) => Promise<WorkspaceBranding | null>;
  loadEmailIdentity: (
    workspaceId: string,
  ) => Promise<WorkspaceEmailIdentity | null>;
  loadProfessionalIdentity: (
    workspaceId: string,
  ) => Promise<TenantEmailProfessionalIdentity | null>;
  loadAgentInWorkspace: (
    workspaceId: string,
    userId: string,
  ) => Promise<TenantEmailAgentIdentity | null>;
  loadAssignedAgentForLead: (
    workspaceId: string,
    leadId: string,
  ) => Promise<TenantEmailAgentIdentity | null>;
  loadAssignedAgentForCustomer: (
    workspaceId: string,
    customerId: string,
  ) => Promise<TenantEmailAgentIdentity | null>;
  /**
   * Phase 3D.4.2 — read-only association lookup (workspaceId + userId).
   * Never invents a thumbnail URL without a persisted row.
   */
  loadAgentEmailHeadshotAssociation: (
    workspaceId: string,
    userId: string,
  ) => Promise<AgentEmailHeadshotAssociationView | null>;
  resolveWebsiteUrl: (workspaceId: string) => Promise<string>;
};

/** Global feature flag — default OFF. Set TENANT_EMAIL_BRANDING=on to activate. */
export function isTenantEmailBrandingEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.TENANT_EMAIL_BRANDING?.trim().toLowerCase() === "on";
}

/**
 * Workspace-scoped branding activation.
 * Global OFF, empty allowlist, malformed ID, or non-listed workspace → false.
 */
export function isTenantEmailBrandingEnabledForWorkspace(
  workspaceId: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isTenantEmailBrandingEnabled(env)) return false;
  return isWorkspaceIdAllowlisted(
    workspaceId,
    env.TENANT_EMAIL_BRANDING_WORKSPACE_IDS,
  );
}

export function isValidReplyToEmail(value: string | null | undefined): boolean {
  const email = value?.trim() ?? "";
  return EMAIL_RE.test(email);
}

export function absoluteEmailAssetUrl(
  url: string | null | undefined,
  origin: string,
): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("/")) {
    return `${origin.replace(/\/$/, "")}${raw}`;
  }
  return raw;
}

function fallbackWebsiteHost(): string {
  try {
    const host = new URL(SITE_URL).hostname;
    if (host && host !== "app.houzzatpro.com") return host;
  } catch {
    /* ignore */
  }
  return "houzzat.com";
}

function pickReplyTo(options: {
  agentEmail: string | null;
  identityReplyTo: string | null;
  identityContact: string | null;
  brandContact: string | null;
}): string | null {
  const candidates = [
    options.agentEmail,
    options.identityReplyTo,
    options.identityContact,
    options.brandContact,
  ];
  for (const candidate of candidates) {
    if (isValidReplyToEmail(candidate)) return candidate!.trim();
  }
  return null;
}

function resolveSignatureAccent(primaryColor: string): string {
  const validated = validateOptionalBrandColor(primaryColor);
  if (validated.ok && validated.value) return validated.value;
  return SAFE_SIGNATURE_ACCENT;
}

/** Build a safe tel: href; returns null when the phone is not dialable. */
export function buildTelHref(phone: string | null | undefined): string | null {
  const raw = phone?.trim();
  if (!raw) return null;
  const normalized = raw.replace(/[^\d+]/g, "");
  const digits = normalized.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  if (normalized.includes("+") && !normalized.startsWith("+")) return null;
  return `tel:${normalized.startsWith("+") ? `+${digits}` : digits}`;
}

type AgentUserRowForEmail = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  image: string | null;
  agentProfile: { phone: string | null; active: boolean } | null;
};

/** ACTIVE membership alone is insufficient — AgentProfile must be active. */
function isEligibleAgentProfile(
  agentProfile: { active: boolean } | null | undefined,
): boolean {
  return agentProfile?.active === true;
}

function mapUserToAgentIdentity(
  user: AgentUserRowForEmail,
): TenantEmailAgentIdentity {
  return {
    userId: user.id,
    name: user.name?.trim() || user.email || "Your agent",
    email: user.email,
    phone: user.phone?.trim() || user.agentProfile?.phone?.trim() || null,
    image: user.image ?? null,
    // No verified per-agent designation field in Phase 3B.
    designation: null,
  };
}

const agentUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  image: true,
  agentProfile: { select: { phone: true, active: true } },
} as const;

/**
 * Premium personal signature (two-column table) or company-level fallback.
 * Never includes agent email. Never uses OWNER as implicit primary.
 */
export function buildAgentEmailSignature(input: {
  workspaceId: string;
  agent: TenantEmailAgentIdentity | null;
  displayName: string;
  contactPhone: string | null;
  senderDisplayName: string | null;
  brokerageRegisteredName: string | null;
  primaryColor: string;
  /** Optional persisted email-headshot association for this agent (read-only). */
  emailHeadshotAssociation?: AgentEmailHeadshotAssociationView | null;
}): { html: string; text: string } {
  const accent = resolveSignatureAccent(input.primaryColor);
  const brokerage =
    input.brokerageRegisteredName?.trim() ||
    input.displayName.trim() ||
    null;

  if (input.agent) {
    const membership = verifiedActiveMembership(
      {
        workspaceId: input.workspaceId,
        userId: input.agent.userId,
        status: "ACTIVE",
      },
      {
        workspaceId: input.workspaceId,
        userId: input.agent.userId,
      },
    );
    const photo = resolveVerifiedAgentEmailSignaturePhoto({
      workspaceId: input.workspaceId,
      userId: input.agent.userId,
      userImage: input.agent.image ?? null,
      membership,
      association: input.emailHeadshotAssociation ?? null,
    });

    const name = input.agent.name.trim() || "Your agent";
    const designation = input.agent.designation?.trim() || null;
    const phoneDisplay = input.agent.phone?.trim() || null;
    const tel = buildTelHref(phoneDisplay);

    const textLines = [name, designation, phoneDisplay, brokerage].filter(
      (line): line is string => Boolean(line),
    );

    // Verified thumbs are pre-cropped circular PNGs. Legacy originals keep the
    // existing CSS circular crop + object-position framing adjustment.
    const photoStyle =
      photo?.kind === "email-headshot"
        ? `display:block;width:${SIGNATURE_PHOTO_PX}px;height:${SIGNATURE_PHOTO_PX}px;border-radius:50%;border:0`
        : `display:block;width:${SIGNATURE_PHOTO_PX}px;height:${SIGNATURE_PHOTO_PX}px;border-radius:50%;border:0;object-fit:cover;object-position:center 30%`;

    const photoCell = photo
      ? `<td width="${SIGNATURE_PHOTO_PX + 12}" valign="top" style="width:${SIGNATURE_PHOTO_PX + 12}px;padding:0 12px 0 0;vertical-align:top">
            <img src="${escapeAttr(photo.url)}" width="${SIGNATURE_PHOTO_PX}" height="${SIGNATURE_PHOTO_PX}" alt="${escapeAttr(`Photo of ${name}`)}" style="${photoStyle}" />
          </td>`
      : "";

    const designationHtml = designation
      ? `<div style="margin:2px 0 0;font-size:13px;line-height:1.35;color:#334155">${escapeHtml(designation)}</div>`
      : "";

    const phoneHtml = phoneDisplay
      ? tel
        ? `<div style="margin:6px 0 0;font-size:13px;line-height:1.4"><a href="${escapeAttr(tel)}" style="color:${escapeAttr(accent)};text-decoration:none;font-weight:600">${escapeHtml(phoneDisplay)}</a></div>`
        : `<div style="margin:6px 0 0;font-size:13px;line-height:1.4;color:#334155">${escapeHtml(phoneDisplay)}</div>`
      : "";

    const brokerageHtml = brokerage
      ? `<div style="margin:6px 0 0;font-size:13px;line-height:1.4;color:#475569">${escapeHtml(brokerage)}</div>`
      : "";

    const html = `<table ${SIGNATURE_MARKER} role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt">
      <tr>
        ${photoCell}
        <td valign="top" style="padding:0;vertical-align:top;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
          <div style="margin:0;font-size:16px;line-height:1.3;font-weight:700;color:${escapeAttr(accent)}">${escapeHtml(name)}</div>
          ${designationHtml}
          ${phoneHtml}
          ${brokerageHtml}
        </td>
      </tr>
    </table>`;

    return { html, text: textLines.join("\n") };
  }

  // Company-level signature — no personal headshot, no agent email.
  const companyName =
    input.senderDisplayName?.trim() ||
    brokerage ||
    input.displayName.trim() ||
    "Your team";
  const phoneDisplay = input.contactPhone?.trim() || null;
  const tel = buildTelHref(phoneDisplay);
  const showBrokerage =
    brokerage &&
    brokerage.toLowerCase() !== companyName.toLowerCase()
      ? brokerage
      : null;

  const textLines = [companyName, phoneDisplay, showBrokerage].filter(
    (line): line is string => Boolean(line),
  );

  const phoneHtml = phoneDisplay
    ? tel
      ? `<div style="margin:6px 0 0;font-size:13px;line-height:1.4"><a href="${escapeAttr(tel)}" style="color:${escapeAttr(accent)};text-decoration:none;font-weight:600">${escapeHtml(phoneDisplay)}</a></div>`
      : `<div style="margin:6px 0 0;font-size:13px;line-height:1.4;color:#334155">${escapeHtml(phoneDisplay)}</div>`
    : "";
  const brokerageHtml = showBrokerage
    ? `<div style="margin:6px 0 0;font-size:13px;line-height:1.4;color:#475569">${escapeHtml(showBrokerage)}</div>`
    : "";

  const html = `<table ${SIGNATURE_MARKER} role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt">
    <tr>
      <td valign="top" style="padding:0;vertical-align:top;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
        <div style="margin:0;font-size:16px;line-height:1.3;font-weight:700;color:${escapeAttr(accent)}">${escapeHtml(companyName)}</div>
        ${phoneHtml}
        ${brokerageHtml}
      </td>
    </tr>
  </table>`;

  return { html, text: textLines.join("\n") };
}

export function toEmailBrandChrome(brand: TenantEmailBrand): EmailBrandChrome {
  return {
    brandLabel: brand.displayName,
    brandLogoUrl: brand.logoUrl,
    brandPrimaryColor: brand.primaryColor,
    brandWebsiteUrl: brand.websiteUrl,
    footerNote: brand.footerNote,
    agentSignatureHtml: brand.signatureHtml,
    agentSignatureText: brand.signatureText,
    agentFromLabel: brand.agent?.name ?? brand.displayName,
  };
}

export function appendAgentSignatureHtml(
  bodyHtml: string,
  signatureHtml?: string | null,
): string {
  const sig = signatureHtml?.trim();
  if (!sig) return bodyHtml;
  // Idempotent — composition paths may already have appended a signature.
  if (
    bodyHtml.includes(SIGNATURE_MARKER) ||
    (sig.includes(SIGNATURE_MARKER) && bodyHtml.includes(sig))
  ) {
    return bodyHtml;
  }
  return `${bodyHtml}
      <div style="margin:24px 0 0;padding-top:16px;border-top:1px solid #a7f3d0;font-size:13px;line-height:1.5;color:#115e59">
        ${sig}
      </div>`;
}

export function appendAgentSignatureText(
  text: string,
  signatureText?: string | null,
): string {
  const sig = signatureText?.trim();
  if (!sig) return text;
  const delimiter = "\n\n--\n";
  if (text.includes(`${delimiter}${sig}`) || text.endsWith(`\n--\n${sig}`)) {
    return text;
  }
  return `${text}${delimiter}${sig}`;
}

export function createDefaultTenantEmailBrandDeps(): TenantEmailBrandDeps {
  return {
    loadBranding: (workspaceId) =>
      prisma.workspaceBranding.findUnique({ where: { workspaceId } }),
    loadEmailIdentity: (workspaceId) =>
      prisma.workspaceEmailIdentity.findUnique({ where: { workspaceId } }),
    loadProfessionalIdentity: async (workspaceId) => {
      const row = await prisma.workspaceProfessionalIdentity.findUnique({
        where: { workspaceId },
        select: { brokerageRegisteredName: true },
      });
      if (!row) return null;
      return { brokerageRegisteredName: row.brokerageRegisteredName };
    },
    loadAgentInWorkspace: async (workspaceId, userId) => {
      const member = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: { workspaceId, userId },
        },
        select: {
          status: true,
          user: { select: agentUserSelect },
        },
      });
      if (!member?.user || member.status !== "ACTIVE") return null;
      if (!isEligibleAgentProfile(member.user.agentProfile)) return null;
      return mapUserToAgentIdentity(member.user);
    },
    loadAssignedAgentForLead: async (workspaceId, leadId) => {
      const lead = await prisma.lead.findFirst({
        where: { id: leadId, workspaceId },
        select: {
          assignedAgentId: true,
          assignedAgent: { select: agentUserSelect },
        },
      });
      if (!lead?.assignedAgentId || !lead.assignedAgent) return null;
      // Confirm ACTIVE membership so we never surface an agent from another tenant.
      const member = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId: lead.assignedAgentId,
          },
        },
        select: { userId: true, status: true },
      });
      if (!member || member.status !== "ACTIVE") return null;
      if (!isEligibleAgentProfile(lead.assignedAgent.agentProfile)) return null;
      return mapUserToAgentIdentity(lead.assignedAgent);
    },
    loadAssignedAgentForCustomer: async (workspaceId, customerId) => {
      const lead = await prisma.lead.findFirst({
        where: {
          workspaceId,
          customerId,
          assignedAgentId: { not: null },
        },
        orderBy: { updatedAt: "desc" },
        select: {
          assignedAgentId: true,
          assignedAgent: { select: agentUserSelect },
        },
      });
      if (!lead?.assignedAgentId || !lead.assignedAgent) return null;
      const member = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId: lead.assignedAgentId,
          },
        },
        select: { userId: true, status: true },
      });
      if (!member || member.status !== "ACTIVE") return null;
      if (!isEligibleAgentProfile(lead.assignedAgent.agentProfile)) return null;
      return mapUserToAgentIdentity(lead.assignedAgent);
    },
    loadAgentEmailHeadshotAssociation: async (workspaceId, userId) => {
      const row = await prisma.agentEmailHeadshot.findUnique({
        where: {
          workspaceId_userId: { workspaceId, userId },
        },
        select: {
          workspaceId: true,
          userId: true,
          sourceUniqueId: true,
          emailHeadshotObjectKey: true,
        },
      });
      return row;
    },
    resolveWebsiteUrl: (workspaceId) =>
      resolveCanonicalPublicOrigin(workspaceId, fallbackWebsiteHost()),
  };
}

/**
 * Pure assembly used by tests and the DB-backed resolver.
 * Always scoped to the provided workspaceId — never reads another tenant.
 */
export function assembleTenantEmailBrand(input: {
  workspaceId: string;
  branding: WorkspaceBranding | null;
  identity: WorkspaceEmailIdentity | null;
  agent: TenantEmailAgentIdentity | null;
  websiteUrl: string;
  brokerageRegisteredName?: string | null;
  emailHeadshotAssociation?: AgentEmailHeadshotAssociationView | null;
}): TenantEmailBrand {
  const mapped = input.branding
    ? workspaceBrandingRowToBrand(input.workspaceId, input.branding)
    : buildNeutralTenantBrand(input.workspaceId);

  const websiteUrl = input.websiteUrl.replace(/\/$/, "");
  const contactEmail =
    input.identity?.contactEmail?.trim() ||
    mapped.contact.email?.trim() ||
    null;
  const contactPhone = mapped.contact.phone?.trim() || null;
  const replyTo = pickReplyTo({
    agentEmail: input.agent?.email ?? null,
    identityReplyTo: input.identity?.replyToEmail ?? null,
    identityContact: input.identity?.contactEmail ?? null,
    brandContact: mapped.contact.email ?? null,
  });

  const signature = buildAgentEmailSignature({
    workspaceId: input.workspaceId,
    agent: input.agent,
    displayName: mapped.displayName,
    contactPhone,
    senderDisplayName: input.identity?.senderDisplayName ?? null,
    brokerageRegisteredName: input.brokerageRegisteredName ?? null,
    primaryColor: mapped.colors.primary,
    emailHeadshotAssociation: input.emailHeadshotAssociation ?? null,
  });

  const footerLegal = mapped.footerLegalText?.trim().split("\n")[0]?.trim();
  const footerNote =
    footerLegal ||
    mapped.tagline?.trim() ||
    `${mapped.displayName} — Powered by HouzzatPRO`;

  return {
    workspaceId: input.workspaceId,
    displayName: mapped.displayName,
    logoUrl: absoluteEmailAssetUrl(mapped.logoUrl, websiteUrl),
    primaryColor: mapped.colors.primary,
    websiteUrl,
    contactEmail,
    contactPhone,
    replyTo,
    fromOverride: null,
    agent: input.agent,
    signatureHtml: signature.html,
    signatureText: signature.text,
    footerNote,
    poweredByHouzzatPro: mapped.poweredByHouzzatPro,
  };
}

export async function resolveTenantEmailBrand(
  input: TenantEmailBrandResolveInput,
  deps: TenantEmailBrandDeps = createDefaultTenantEmailBrandDeps(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<TenantEmailBrand | null> {
  const workspaceId = input.workspaceId?.trim();
  if (!isTenantEmailBrandingEnabledForWorkspace(workspaceId, env)) {
    return null;
  }
  if (!workspaceId) return null;

  const [branding, identity, professional, websiteUrl] = await Promise.all([
    deps.loadBranding(workspaceId),
    deps.loadEmailIdentity(workspaceId),
    deps.loadProfessionalIdentity(workspaceId),
    deps.resolveWebsiteUrl(workspaceId),
  ]);

  let agent: TenantEmailAgentIdentity | null = null;
  const preferred = input.preferredAgentUserId?.trim();
  if (preferred) {
    // Explicit preferred authority: validate that agent only.
    // Never fall through to lead/customer assignees (wrong-person risk).
    agent = await deps.loadAgentInWorkspace(workspaceId, preferred);
  } else {
    if (input.leadId?.trim()) {
      agent = await deps.loadAssignedAgentForLead(
        workspaceId,
        input.leadId.trim(),
      );
    }
    if (!agent && input.customerId?.trim()) {
      agent = await deps.loadAssignedAgentForCustomer(
        workspaceId,
        input.customerId.trim(),
      );
    }
  }

  // Optional association only — never abort brand/signature assembly on lookup
  // failure. Soft-fail does NOT make pre-migration deploy safe for photo upload
  // clear paths; migration-first remains mandatory for AgentEmailHeadshot.
  const emailHeadshotAssociation = agent
    ? await loadAgentEmailHeadshotAssociationBestEffort(
        deps,
        workspaceId,
        agent.userId,
      )
    : null;

  return assembleTenantEmailBrand({
    workspaceId,
    branding,
    identity,
    agent,
    websiteUrl,
    brokerageRegisteredName: professional?.brokerageRegisteredName ?? null,
    emailHeadshotAssociation,
  });
}

/**
 * Best-effort read of AgentEmailHeadshot. Lookup errors are logged and treated
 * as "no association" so branding-enabled emails still send with canonical
 * User.image (or no photo). Does not catch errors from other brand deps.
 */
async function loadAgentEmailHeadshotAssociationBestEffort(
  deps: TenantEmailBrandDeps,
  workspaceId: string,
  userId: string,
): Promise<AgentEmailHeadshotAssociationView | null> {
  try {
    return await deps.loadAgentEmailHeadshotAssociation(workspaceId, userId);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : null;
    console.warn(
      "[tenant-email-brand] email headshot association lookup failed",
      {
        workspaceId,
        userId,
        code,
        reason: error instanceof Error ? error.name : "unknown",
      },
    );
    return null;
  }
}
