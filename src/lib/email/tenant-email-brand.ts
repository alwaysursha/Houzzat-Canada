/**
 * Phase 1 — tenant-aware chrome for existing customer-facing emails.
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
import { escapeHtml } from "@/lib/email/layout";
import { isWorkspaceIdAllowlisted } from "@/lib/email/workspace-id-allowlist";
import { prisma } from "@/lib/prisma";
import { resolveCanonicalPublicOrigin } from "@/lib/tenancy/canonical-public-origin";
import { buildNeutralTenantBrand } from "@/lib/tenancy/neutral-tenant-brand";
import { workspaceBrandingRowToBrand } from "@/lib/tenancy/resolve-workspace-brand";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type TenantEmailAgentIdentity = {
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
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

export type TenantEmailBrandDeps = {
  loadBranding: (workspaceId: string) => Promise<WorkspaceBranding | null>;
  loadEmailIdentity: (
    workspaceId: string,
  ) => Promise<WorkspaceEmailIdentity | null>;
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

function buildSignature(input: {
  agent: TenantEmailAgentIdentity | null;
  displayName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  senderDisplayName: string | null;
}): { html: string; text: string } {
  if (input.agent) {
    const lines = [
      input.agent.name,
      input.displayName,
      input.agent.phone,
      input.agent.email,
    ].filter((line): line is string => Boolean(line?.trim()));
    const text = lines.join("\n");
    const html = lines
      .map((line, i) =>
        i === 0
          ? `<strong style="color:#064e3b">${escapeHtml(line)}</strong>`
          : escapeHtml(line),
      )
      .join("<br/>");
    return { html, text };
  }

  const fallbackName =
    input.senderDisplayName?.trim() || input.displayName.trim() || "Your team";
  const lines = [
    fallbackName,
    input.contactPhone,
    input.contactEmail,
  ].filter((line): line is string => Boolean(line?.trim()));
  const text = lines.join("\n");
  const html = lines
    .map((line, i) =>
      i === 0
        ? `<strong style="color:#064e3b">${escapeHtml(line)}</strong>`
        : escapeHtml(line),
    )
    .join("<br/>");
  return { html, text };
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
  return `${text}\n\n--\n${sig}`;
}

export function createDefaultTenantEmailBrandDeps(): TenantEmailBrandDeps {
  return {
    loadBranding: (workspaceId) =>
      prisma.workspaceBranding.findUnique({ where: { workspaceId } }),
    loadEmailIdentity: (workspaceId) =>
      prisma.workspaceEmailIdentity.findUnique({ where: { workspaceId } }),
    loadAgentInWorkspace: async (workspaceId, userId) => {
      const member = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: { workspaceId, userId },
        },
        select: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              agentProfile: { select: { phone: true } },
            },
          },
        },
      });
      if (!member?.user) return null;
      return {
        userId: member.user.id,
        name: member.user.name?.trim() || member.user.email || "Your agent",
        email: member.user.email,
        phone: member.user.agentProfile?.phone ?? null,
      };
    },
    loadAssignedAgentForLead: async (workspaceId, leadId) => {
      const lead = await prisma.lead.findFirst({
        where: { id: leadId, workspaceId },
        select: {
          assignedAgentId: true,
          assignedAgent: {
            select: {
              id: true,
              name: true,
              email: true,
              agentProfile: { select: { phone: true } },
            },
          },
        },
      });
      if (!lead?.assignedAgentId || !lead.assignedAgent) return null;
      // Confirm membership so we never surface an agent from another tenant.
      const member = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId: lead.assignedAgentId,
          },
        },
        select: { userId: true },
      });
      if (!member) return null;
      return {
        userId: lead.assignedAgent.id,
        name:
          lead.assignedAgent.name?.trim() ||
          lead.assignedAgent.email ||
          "Your agent",
        email: lead.assignedAgent.email,
        phone: lead.assignedAgent.agentProfile?.phone ?? null,
      };
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
          assignedAgent: {
            select: {
              id: true,
              name: true,
              email: true,
              agentProfile: { select: { phone: true } },
            },
          },
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
        select: { userId: true },
      });
      if (!member) return null;
      return {
        userId: lead.assignedAgent.id,
        name:
          lead.assignedAgent.name?.trim() ||
          lead.assignedAgent.email ||
          "Your agent",
        email: lead.assignedAgent.email,
        phone: lead.assignedAgent.agentProfile?.phone ?? null,
      };
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

  const signature = buildSignature({
    agent: input.agent,
    displayName: mapped.displayName,
    contactEmail,
    contactPhone,
    senderDisplayName: input.identity?.senderDisplayName ?? null,
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

  const [branding, identity, websiteUrl] = await Promise.all([
    deps.loadBranding(workspaceId),
    deps.loadEmailIdentity(workspaceId),
    deps.resolveWebsiteUrl(workspaceId),
  ]);

  let agent: TenantEmailAgentIdentity | null = null;
  const preferred = input.preferredAgentUserId?.trim();
  if (preferred) {
    agent = await deps.loadAgentInWorkspace(workspaceId, preferred);
  }
  if (!agent && input.leadId?.trim()) {
    agent = await deps.loadAssignedAgentForLead(workspaceId, input.leadId.trim());
  }
  if (!agent && input.customerId?.trim()) {
    agent = await deps.loadAssignedAgentForCustomer(
      workspaceId,
      input.customerId.trim(),
    );
  }

  return assembleTenantEmailBrand({
    workspaceId,
    branding,
    identity,
    agent,
    websiteUrl,
  });
}
