import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformDetailGrid } from "@/components/platform/PlatformDetailGrid";
import {
  PlatformBadge,
  PlatformErrorState,
  PlatformPageHeader,
  PlatformPanel,
} from "@/components/platform/PlatformUi";
import {
  getPlatformSubscription,
  PlatformApiClientError,
} from "@/lib/platform/ui/api-client";
import { formatCents, formatPlatformDate, titleCaseStatus } from "@/lib/platform/ui/format";
import { platformStatusTone } from "@/lib/platform/ui/status-tone";

type PageProps = {
  params: Promise<{ subscriptionId: string }>;
};

type JsonRecord = Record<string, unknown>;

function str(value: unknown): string {
  if (value == null || value === "") return "—";
  return String(value);
}

export default async function PlatformSubscriptionDetailPage({ params }: PageProps) {
  const { subscriptionId } = await params;
  let subscription: JsonRecord | null = null;
  let errorMessage: string | null = null;

  try {
    subscription = (await getPlatformSubscription(subscriptionId)) as JsonRecord;
  } catch (error) {
    if (error instanceof PlatformApiClientError && error.status === 404) {
      notFound();
    }
    errorMessage =
      error instanceof PlatformApiClientError
        ? error.message
        : "Unable to load subscription detail.";
  }

  if (errorMessage) {
    return (
      <>
        <PlatformPageHeader title="Subscription" />
        <PlatformErrorState title="Subscription unavailable" message={errorMessage} />
      </>
    );
  }

  if (!subscription) notFound();

  return (
    <>
      <PlatformPageHeader
        title={`Subscription ${str(subscription.id).slice(0, 8)}…`}
        description="Read-only subscription detail."
      />

      <div className="space-y-6">
        <PlatformPanel title="Subscription">
          <PlatformDetailGrid
            items={[
              { label: "Subscription ID", value: str(subscription.id) },
              {
                label: "Workspace",
                value: subscription.workspaceId ? (
                  <Link
                    href={`/platform/workspaces/${str(subscription.workspaceId)}`}
                    className="text-emerald-400 hover:text-emerald-300"
                  >
                    {str(subscription.workspaceId)}
                  </Link>
                ) : (
                  "—"
                ),
              },
              {
                label: "Status",
                value: (
                  <PlatformBadge tone={platformStatusTone(str(subscription.status))}>
                    {titleCaseStatus(str(subscription.status))}
                  </PlatformBadge>
                ),
              },
              { label: "Source", value: titleCaseStatus(str(subscription.source)) },
              { label: "Plan", value: str(subscription.planCode) },
              { label: "Profile", value: str(subscription.entitlementProfileCode) },
              { label: "Cadence", value: str(subscription.billingCadence) },
              {
                label: "Recurring",
                value: formatCents(subscription.recurringAmountCents as number | null),
              },
              {
                label: "Setup fee",
                value: formatCents(subscription.setupFeeCents as number | null),
              },
              {
                label: "Seats",
                value: `${str(subscription.includedSeats)} + ${str(subscription.additionalSeats)}`,
              },
              {
                label: "Period start",
                value: formatPlatformDate(str(subscription.currentPeriodStart)),
              },
              {
                label: "Period end",
                value: formatPlatformDate(str(subscription.currentPeriodEnd)),
              },
              {
                label: "Trial ends",
                value: formatPlatformDate(str(subscription.trialEndsAt)),
              },
              {
                label: "Cancel at period end",
                value: subscription.cancelAtPeriodEnd ? "Yes" : "No",
              },
              {
                label: "Canceled at",
                value: formatPlatformDate(str(subscription.canceledAt)),
              },
              {
                label: "Past due since",
                value: formatPlatformDate(str(subscription.pastDueSince)),
              },
            ]}
          />
        </PlatformPanel>

        <PlatformPanel title="Stripe presence">
          <PlatformDetailGrid
            items={[
              {
                label: "Stripe customer",
                value: subscription.hasStripeCustomer ? "Present" : "None",
              },
              {
                label: "Stripe subscription",
                value: subscription.hasStripeSubscription ? "Present" : "None",
              },
              {
                label: "Stripe price",
                value: subscription.hasStripePrice ? "Present" : "None",
              },
              {
                label: "Checkout session",
                value: subscription.hasStripeCheckoutSession ? "Present" : "None",
              },
            ]}
          />
        </PlatformPanel>
      </div>
    </>
  );
}
