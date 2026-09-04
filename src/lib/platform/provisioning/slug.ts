/**
 * Stage 6.9 — server-side workspace slug derivation.
 * Never accepts client-supplied slug or workspaceId.
 */

import type { PrismaClient } from "@prisma/client";
import { RESERVED_PLATFORM_WORKSPACE_SLUGS } from "@/lib/tenancy/platform-hostname";
import { PROVISIONING_RESERVED_SLUGS } from "./constants";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function deriveWorkspaceDisplayName(input: {
  brokerageName?: string | null;
  businessName?: string | null;
  contactName?: string | null;
}): string {
  const brokerage = input.brokerageName?.trim();
  if (brokerage) return brokerage.slice(0, 120);
  const business = input.businessName?.trim();
  if (business) return business.slice(0, 120);
  const contact = input.contactName?.trim();
  if (contact) return contact.slice(0, 120);
  return "New Workspace";
}

export function slugifyWorkspaceName(raw: string): string {
  const base = raw
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "workspace";
}

function isReservedSlug(slug: string): boolean {
  if ((RESERVED_PLATFORM_WORKSPACE_SLUGS as readonly string[]).includes(slug)) {
    return true;
  }
  if ((PROVISIONING_RESERVED_SLUGS as readonly string[]).includes(slug)) {
    return true;
  }
  return false;
}

function isValidCandidate(slug: string): boolean {
  return SLUG_RE.test(slug) && !isReservedSlug(slug);
}

/**
 * Produce a unique, normalized workspace slug.
 * Sequential existence checks only — no $transaction.
 */
export async function allocateUniqueWorkspaceSlug(
  db: PrismaClient,
  displayName: string,
): Promise<string> {
  const base = slugifyWorkspaceName(displayName);
  const candidates: string[] = [];

  if (isValidCandidate(base)) candidates.push(base);
  for (let i = 2; i <= 50; i += 1) {
    const suffix = `-${i}`;
    const trimmed = base.slice(0, Math.max(1, 63 - suffix.length));
    const candidate = `${trimmed}${suffix}`;
    if (isValidCandidate(candidate)) candidates.push(candidate);
  }

  // Last-resort random suffix if name collisions exhaust the numeric range.
  for (let i = 0; i < 8; i += 1) {
    const rand = Math.random().toString(36).slice(2, 8);
    const candidate = `ws-${rand}`;
    if (isValidCandidate(candidate)) candidates.push(candidate);
  }

  for (const candidate of candidates) {
    const existing = await db.workspace.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }

  throw new Error("Unable to allocate a unique workspace slug");
}
