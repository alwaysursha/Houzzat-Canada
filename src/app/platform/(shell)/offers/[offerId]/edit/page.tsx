import { notFound } from "next/navigation";
import { PlatformOfferForm } from "@/components/platform/PlatformOfferForm";
import {
  PlatformErrorState,
  PlatformPageHeader,
} from "@/components/platform/PlatformUi";
import {
  getPlatformOffer,
  PlatformApiClientError,
} from "@/lib/platform/ui/api-client";

type PageProps = {
  params: Promise<{ offerId: string }>;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function str(value: unknown): string {
  if (value == null || value === "") return "";
  return String(value);
}

export default async function PlatformEditOfferPage({ params }: PageProps) {
  const { offerId } = await params;
  let offer: JsonRecord | null = null;
  let errorMessage: string | null = null;

  try {
    offer = (await getPlatformOffer(offerId)) as JsonRecord;
  } catch (error) {
    if (error instanceof PlatformApiClientError && error.status === 404) {
      notFound();
    }
    errorMessage =
      error instanceof PlatformApiClientError
        ? error.message
        : "Unable to load offer.";
  }

  if (errorMessage) {
    return (
      <>
        <PlatformPageHeader title="Edit offer" />
        <PlatformErrorState title="Offer unavailable" message={errorMessage} />
      </>
    );
  }
  if (!offer) notFound();
  if (str(offer.status) !== "DRAFT") {
    return (
      <>
        <PlatformPageHeader title="Edit offer" />
        <PlatformErrorState
          title="Offer not editable"
          message="Only DRAFT offers can be edited. Cancel and create a new offer to change commercial terms."
        />
      </>
    );
  }

  const prospect = asRecord(offer.prospect);
  const lineItems = Array.isArray(offer.lineItems)
    ? (offer.lineItems as JsonRecord[])
    : [];
  const hasCustomApp = lineItems.some(
    (item) => str(item.code) === "CUSTOM_CONSUMER_APP",
  );
  const google = lineItems.find((item) => str(item.code) === "GOOGLE_PPC");
  const meta = lineItems.find((item) => str(item.code) === "META_ADS");
  const prospectLabel = prospect
    ? `${str(prospect.contactName) || str(prospect.businessName)} · ${str(prospect.email)}`
    : str(offer.prospectId);

  return (
    <>
      <PlatformPageHeader
        title="Edit Offer"
        description="Draft commercial terms only. Sent offers are immutable."
      />
      <PlatformOfferForm
        mode="edit"
        offerId={offerId}
        prospectId={str(offer.prospectId)}
        prospectLabel={prospectLabel}
        initial={{
          planCode: str(offer.planCode) as "SOLO" | "TEAM" | "BROKERAGE",
          billingCadence: str(offer.billingCadence) as "MONTHLY" | "ANNUAL",
          negotiatedRecurringAmountCents:
            offer.negotiatedRecurringAmountCents as number,
          setupFeeCents: offer.setupFeeCents as number,
          additionalSeats: offer.additionalSeats as number,
          trialDays: (offer.trialDays as number | null) ?? null,
          proposedStartDate: str(offer.proposedStartDate) || null,
          expiresAt: str(offer.expiresAt) || null,
          includeCustomApp: hasCustomApp,
          includeGooglePpc: Boolean(google),
          googlePpcAmountCents: google
            ? (google.amountCents as number)
            : null,
          includeMetaAds: Boolean(meta),
          metaAdsAmountCents: meta ? (meta.amountCents as number) : null,
        }}
      />
    </>
  );
}
