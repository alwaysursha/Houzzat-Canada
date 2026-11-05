import { highOctaneEmailChrome, isHighOctaneEmailSlug } from "@/lib/email/high-octane/chrome";
import type { EmailBrandChrome } from "@/lib/email/tenant-email-brand";
import { prisma } from "@/lib/prisma";

/**
 * Royal presentation for the HIGH OCTANE workspace only.
 * Returns null for every other slug. Never sets a From address.
 * Brokerage text is included only when the workspace record has it.
 */
export async function highOctaneEmailChromeForWorkspace(
  workspaceId: string,
  websiteUrl: string,
): Promise<EmailBrandChrome | null> {
  const id = workspaceId.trim();
  if (!id || !websiteUrl.trim()) return null;
  const row = await prisma.workspace.findUnique({
    where: { id },
    select: { slug: true, name: true },
  });
  if (!row || !isHighOctaneEmailSlug(row.slug)) return null;
  const professional = await prisma.workspaceProfessionalIdentity.findUnique({
    where: { workspaceId: id },
    select: { brokerageRegisteredName: true },
  });
  const brokerage = professional?.brokerageRegisteredName?.trim() || "";
  const footerNote = brokerage
    ? `${brokerage}\nPowered by HouzzatPRO`
    : "Powered by HouzzatPRO";
  return highOctaneEmailChrome({
    brandLabel: row.name?.trim() || "HIGH OCTANE",
    websiteUrl,
    footerNote,
  });
}
