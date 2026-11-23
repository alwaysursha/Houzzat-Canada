import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformOfferForm } from "@/components/platform/PlatformOfferForm";
import {
  PlatformErrorState,
  PlatformPageHeader,
} from "@/components/platform/PlatformUi";
import {
  getPlatformProspect,
  getPlatformWorkspace,
  listPlatformWorkspaces,
  PlatformApiClientError,
} from "@/lib/platform/ui/api-client";

type PageProps = {
  searchParams: Promise<{ prospectId?: string; workspaceId?: string }>;
};

export default async function PlatformNewOfferPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const prospectId = params.prospectId?.trim();
  const workspaceId = params.workspaceId?.trim() || null;
  if (!prospectId) {
    return (
      <>
        <PlatformPageHeader
          title="New commercial offer"
          description="Select a prospect first."
        />
        <PlatformErrorState
          title="Prospect required"
          message="Open a prospect and choose Create Offer, or pass ?prospectId=."
        />
        <p className="mt-4 text-sm text-slate-400">
          <Link href="/platform/prospects" className="text-emerald-400">
            Browse prospects
          </Link>
        </p>
      </>
    );
  }

  let prospectLabel = prospectId;
  try {
    const prospect = await getPlatformProspect(prospectId);
    const name =
      (prospect.contactName as string | undefined) ||
      (prospect.businessName as string | undefined) ||
      (prospect.email as string | undefined);
    if (name) prospectLabel = `${name} · ${prospect.email as string}`;
  } catch (error) {
    if (error instanceof PlatformApiClientError && error.status === 404) {
      notFound();
    }
    return (
      <>
        <PlatformPageHeader title="New commercial offer" />
        <PlatformErrorState
          title="Prospect unavailable"
          message={
            error instanceof PlatformApiClientError
              ? error.message
              : "Unable to load prospect."
          }
        />
      </>
    );
  }

  let workspaces: { id: string; name: string; slug: string }[] = [];
  try {
    const page = await listPlatformWorkspaces({ limit: 100 });
    workspaces = page.items.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
    }));
  } catch {
    workspaces = [];
  }
  if (workspaceId && !workspaces.some((workspace) => workspace.id === workspaceId)) {
    try {
      const workspace = await getPlatformWorkspace(workspaceId);
      if (typeof workspace.name === "string" && typeof workspace.slug === "string") {
        workspaces = [
          { id: workspaceId, name: workspace.name, slug: workspace.slug },
          ...workspaces,
        ];
      }
    } catch {
      workspaces = [{ id: workspaceId, name: workspaceId, slug: workspaceId }, ...workspaces];
    }
  }

  return (
    <>
      <PlatformPageHeader
        title="Create Offer"
        description="Enter the final recurring price and setup fee. Catalog prices stay unchanged, and checkout charges the saved totals."
      />
      <PlatformOfferForm
        mode="create"
        prospectId={prospectId}
        prospectLabel={prospectLabel}
        workspaces={workspaces}
        linkedWorkspaceId={workspaceId}
        lockWorkspace={Boolean(workspaceId)}
      />
    </>
  );
}
