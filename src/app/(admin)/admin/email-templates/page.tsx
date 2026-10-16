import { redirect } from "next/navigation";
import { EmailTemplatesAdminClient } from "@/components/admin/EmailTemplatesAdminClient";
import { resolveAdminPageSurface } from "@/lib/admin/resolve-admin-page-surface";
import { listWorkspaceEmailTemplates } from "@/lib/email/workspace-templates/service";
import { resolveCanonicalPublicOrigin } from "@/lib/tenancy/canonical-public-origin";
import { toMarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";
import { resolveRequestTenancy } from "@/lib/tenancy/resolve-request-tenancy";

export const metadata = { title: "Email Templates" };

export default async function AdminEmailTemplatesPage({
  searchParams,
}: {
  searchParams?: Promise<{ type?: string }>;
}) {
  const surface = await resolveAdminPageSurface();
  if (surface.kind === "deny") redirect("/agent");

  // Master Admin must not edit tenant template overrides.
  if (surface.kind === "platform") {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl tracking-tight text-ink">
          Email Templates
        </h1>
        <p className="max-w-xl text-sm text-ink/60">
          Email template customization is managed in each tenant Command Centre
          by workspace OWNER or ADMIN. HouzzatPRO Master Admin does not edit
          tenant overrides from this surface.
        </p>
      </div>
    );
  }

  const params = searchParams ? await searchParams : {};
  const initialType = params.type?.trim() || null;

  const catalog = await listWorkspaceEmailTemplates({
    workspaceId: surface.auth.workspaceId,
    role: surface.auth.workspaceRole,
  });

  if (!catalog.ok) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl tracking-tight text-ink">
          Email Templates
        </h1>
        <p className="max-w-xl rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {catalog.message}
        </p>
      </div>
    );
  }

  const tenancy = await resolveRequestTenancy(surface.request);
  if (!tenancy.ok) redirect("/agent");
  // Fail closed if hostname tenancy drifts from Command Centre workspace.
  if (tenancy.workspaceId !== surface.auth.workspaceId) redirect("/agent");
  const canonicalOrigin = await resolveCanonicalPublicOrigin(
    tenancy.workspaceId,
    tenancy.hostname,
    tenancy.origin.startsWith("http://") ? "http:" : "https:",
  );
  const brand = toMarketingPresentationBrand(tenancy, canonicalOrigin);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight text-ink sm:text-4xl">
          Email Templates
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/60">
          Customize outbound email copy for {brand.displayName}. Drafts never
          affect live sends. Published versions are stored for this workspace —
          live senders are not wired yet.
        </p>
      </div>
      <EmailTemplatesAdminClient
        initialTemplates={catalog.data.map((item) => ({
          type: item.type,
          label: item.label,
          description: item.description,
          editableFields: [...item.editableFields],
          allowedVariables: [...item.allowedVariables],
          protectedElements: [...item.protectedElements],
          systemDefaults: item.systemDefaults,
          hasDraft: item.hasDraft,
          hasPublished: item.hasPublished,
          publishedVersionNumber: item.publishedVersionNumber,
          publishedAt: item.publishedAt
            ? item.publishedAt.toISOString()
            : null,
          draftUpdatedAt: item.draftUpdatedAt
            ? item.draftUpdatedAt.toISOString()
            : null,
          resolvedSource: item.resolved.source,
        }))}
        initialType={initialType}
        brand={{
          displayName: brand.displayName,
          logoUrl: brand.logoUrl,
          primaryColor: brand.colors.primary,
          websiteUrl: brand.canonicalOrigin || brand.publicOrigin,
          footerNote: brand.footerLegalText,
        }}
      />
    </div>
  );
}
