import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformOfferForm } from "@/components/platform/PlatformOfferForm";
import {
  PlatformErrorState,
  PlatformPageHeader,
} from "@/components/platform/PlatformUi";
import {
  getPlatformProspect,
  PlatformApiClientError,
} from "@/lib/platform/ui/api-client";

type PageProps = {
  searchParams: Promise<{ prospectId?: string }>;
};

export default async function PlatformNewOfferPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const prospectId = params.prospectId?.trim();
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

  return (
    <>
      <PlatformPageHeader
        title="Create Offer"
        description="Negotiate commercial terms from the locked HouzzatPRO catalog. Stripe/checkout is not part of this stage."
      />
      <PlatformOfferForm
        mode="create"
        prospectId={prospectId}
        prospectLabel={prospectLabel}
      />
    </>
  );
}
