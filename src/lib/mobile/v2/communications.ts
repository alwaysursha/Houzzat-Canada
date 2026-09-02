/**
 * Stage 5.8 — Shared Mobile v2 Communications helpers.
 *
 * Canonical store: LeadEmailLog (outbound CRM email only).
 * Web authority: /agent/inbox — "Outbound email log for your leads".
 * INBOUND EMAIL IS NOT CANONICAL.
 */

import type { Prisma, WorkspaceMemberRole } from "@prisma/client";

export const COMMUNICATIONS_PAGE_SIZE = 30;
export const COMMUNICATIONS_SNIPPET_MAX = 160;

export type CommunicationsChannel = "email";

/** Lead visibility for global communications — mirrors Stage 4.3A lead list. */
export function communicationsLeadWhere(
  workspaceId: string,
  userId: string,
  role: WorkspaceMemberRole,
): Prisma.LeadWhereInput {
  if (role === "AGENT") {
    return {
      workspaceId,
      OR: [{ assignedAgentId: userId }, { assignedAgentId: null }],
    };
  }
  // OWNER / ADMIN — workspace-wide
  return { workspaceId };
}

export function truncateSnippet(
  body: string,
  max = COMMUNICATIONS_SNIPPET_MAX,
): string {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1).trimEnd()}…`;
}

export function formatCommunicationRow(e: {
  id: string;
  subject: string;
  body: string;
  toEmail: string;
  kind: string;
  openedAt: Date | null;
  openCount: number;
  clickedAt: Date | null;
  clickCount: number;
  lastClickedUrl: string | null;
  createdAt: Date;
  leadId: string;
  lead: {
    customer: { name: string | null; email: string | null } | null;
  };
  sentBy: { name: string | null; email: string | null } | null;
}) {
  return {
    id: e.id,
    /** Only canonical channel today. */
    channel: "email" as const,
    /**
     * LeadEmailLog is outbound-only (send → log).
     * Do not imply a two-way inbox.
     */
    direction: "outbound" as const,
    subject: e.subject,
    snippet: truncateSnippet(e.body),
    toEmail: e.toEmail,
    kind: e.kind,
    openedAt: e.openedAt ? e.openedAt.toISOString() : null,
    openCount: e.openCount,
    clickedAt: e.clickedAt ? e.clickedAt.toISOString() : null,
    clickCount: e.clickCount,
    lastClickedUrl: e.lastClickedUrl,
    createdAt: e.createdAt.toISOString(),
    leadId: e.leadId,
    customerName: e.lead.customer?.name ?? null,
    customerEmail: e.lead.customer?.email ?? null,
    sentByName: e.sentBy?.name || e.sentBy?.email || null,
  };
}

export type MobileCommunicationRow = ReturnType<typeof formatCommunicationRow>;

export function parseCommunicationsCursor(
  raw: string | null,
): Date | null | "invalid" {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "invalid";
  return d;
}

export function buildCommunicationsSearchOr(
  q: string,
): Prisma.LeadEmailLogWhereInput[] {
  return [
    { subject: { contains: q, mode: "insensitive" } },
    { body: { contains: q, mode: "insensitive" } },
    { toEmail: { contains: q, mode: "insensitive" } },
    { lead: { customer: { name: { contains: q, mode: "insensitive" } } } },
    { lead: { customer: { email: { contains: q, mode: "insensitive" } } } },
  ];
}
