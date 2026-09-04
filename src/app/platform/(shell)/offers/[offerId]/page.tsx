import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformOfferActions } from "@/components/platform/PlatformOfferActions";
import { PlatformDetailGrid } from "@/components/platform/PlatformDetailGrid";
import {
  PlatformBadge,
  PlatformErrorState,
  PlatformPageHeader,
  PlatformPanel,
  PlatformTableWrap,
} from "@/components/platform/PlatformUi";
import {
  getPlatformOffer,
  PlatformApiClientError,
} from "@/lib/platform/ui/api-client";
import { formatCents, formatPlatformDate, titleCaseStatus } from "@/lib/platform/ui/format";
import { platformStatusTone } from "@/lib/platform/ui/status-tone";

type PageProps = {
  params: Promise<{ offerId: string }>;
};

type JsonRecord = Record<string, unknown>;

function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? (value as JsonRecord[]) : [];
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function str(value: unknown): string {
  if (value == null || value === "") return "—";
  return String(value);
}

export default async function PlatformOfferDetailPage({ params }: PageProps) {
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
        : "Unable to load offer detail.";
  }

  if (errorMessage) {
    return (
      <>
        <PlatformPageHeader title="Commercial offer" />
        <PlatformErrorState title="Offer unavailable" message={errorMessage} />
      </>
    );
  }

  if (!offer) notFound();

  const acceptance = asRecord(offer.acceptance);
  const subscription = asRecord(offer.subscription);
  const provisioning = asRecord(offer.provisioning);
  const prospect = asRecord(offer.prospect);
  const prospectLabel = prospect
    ? `${str(prospect.contactName) || str(prospect.businessName)} · ${str(prospect.email)}`
    : str(offer.prospectId);

  return (
    <>
      <PlatformPageHeader
        title={`Offer ${str(offer.id).slice(0, 8)}…`}
        description="Commercial offer detail. Token secrets are never displayed."
      />

      <div className="space-y-6">
        <PlatformOfferActions
          offerId={str(offer.id)}
          status={str(offer.status)}
          prospectLabel={prospectLabel}
          planCode={str(offer.planCode)}
          billingCadence={str(offer.billingCadence)}
          recurringTotalCents={
            (offer.recurringTotalCents as number | undefined) ??
            (offer.negotiatedRecurringAmountCents as number)
          }
          oneTimeTotalCents={(offer.oneTimeTotalCents as number | undefined) ?? 0}
          includedSeats={Number(offer.includedSeats ?? 0)}
          additionalSeats={Number(offer.additionalSeats ?? 0)}
          expiresAt={
            offer.expiresAt ? formatPlatformDate(str(offer.expiresAt)) : null
          }
        />

        <PlatformPanel title="Offer summary">
          <PlatformDetailGrid
            items={[
              { label: "Offer ID", value: str(offer.id) },
              {
                label: "Prospect",
                value: (
                  <Link
                    href={`/platform/prospects/${str(offer.prospectId)}`}
                    className="text-emerald-400 hover:text-emerald-300"
                  >
                    {prospectLabel}
                  </Link>
                ),
              },
              {
                label: "Status",
                value: (
                  <PlatformBadge tone={platformStatusTone(str(offer.status))}>
                    {titleCaseStatus(str(offer.status))}
                  </PlatformBadge>
                ),
              },
              { label: "Plan", value: str(offer.planCode) },
              { label: "Cadence", value: str(offer.billingCadence) },
              {
                label: "Standard recurring",
                value: formatCents(offer.standardRecurringAmountCents as number | null),
              },
              {
                label: "Negotiated recurring",
                value: formatCents(offer.negotiatedRecurringAmountCents as number | null),
              },
              {
                label: "Setup fee",
                value: formatCents(offer.setupFeeCents as number | null),
              },
              {
                label: "Recurring total",
                value: formatCents(offer.recurringTotalCents as number | null),
              },
              {
                label: "One-time total",
                value: formatCents(offer.oneTimeTotalCents as number | null),
              },
              {
                label: "Seats",
                value: `${str(offer.includedSeats)} included + ${str(offer.additionalSeats)} additional`,
              },
              { label: "Trial days", value: str(offer.trialDays) },
              {
                label: "Proposed start",
                value: formatPlatformDate(str(offer.proposedStartDate)),
              },
              { label: "Expires", value: formatPlatformDate(str(offer.expiresAt)) },
              { label: "Sent", value: formatPlatformDate(str(offer.sentAt)) },
              { label: "Viewed", value: formatPlatformDate(str(offer.viewedAt)) },
              { label: "Accepted", value: formatPlatformDate(str(offer.acceptedAt)) },
            ]}
          />
        </PlatformPanel>

        <PlatformPanel title="Line items">
          {asArray(offer.lineItems).length === 0 ? (
            <p className="text-sm text-slate-400">No line items.</p>
          ) : (
            <PlatformTableWrap>
              <thead className="bg-slate-900/60 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2">Kind</th>
                  <th className="px-4 py-2">Qty</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">Recurring</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {asArray(offer.lineItems).map((item) => (
                  <tr key={str(item.id)}>
                    <td className="px-4 py-2 text-slate-200">{str(item.description)}</td>
                    <td className="px-4 py-2 text-slate-400">{str(item.kind)}</td>
                    <td className="px-4 py-2 text-slate-300">{str(item.quantity)}</td>
                    <td className="px-4 py-2 text-slate-300">
                      {formatCents(item.amountCents as number | null)}
                    </td>
                    <td className="px-4 py-2 text-slate-300">
                      {item.isRecurring ? "Yes" : "No"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </PlatformTableWrap>
          )}
        </PlatformPanel>

        <div className="grid gap-6 lg:grid-cols-2">
          <PlatformPanel title="Acceptance">
            {acceptance ? (
              <PlatformDetailGrid
                items={[
                  {
                    label: "Accepted at",
                    value: formatPlatformDate(str(acceptance.acceptedAt)),
                  },
                  { label: "Accepted email", value: str(acceptance.acceptedEmail) },
                  { label: "Terms version", value: str(acceptance.termsVersion) },
                  {
                    label: "Privacy version",
                    value: str(acceptance.privacyVersion),
                  },
                  {
                    label: "Commercial terms hash",
                    value: str(
                      acceptance.commercialTermsHashFingerprint ??
                        acceptance.commercialTermsHash,
                    ),
                  },
                ]}
              />
            ) : (
              <p className="text-sm text-slate-400">Not yet accepted.</p>
            )}
          </PlatformPanel>

          <PlatformPanel title="Token metadata">
            {asArray(offer.tokens).length === 0 ? (
              <p className="text-sm text-slate-400">No token metadata.</p>
            ) : (
              <ul className="space-y-2 text-sm text-slate-300">
                {asArray(offer.tokens).map((token) => (
                  <li key={str(token.id)} className="rounded border border-slate-800 p-3">
                    <p>Token ID: {str(token.id).slice(0, 8)}…</p>
                    <p className="text-xs text-slate-500">
                      Expires {formatPlatformDate(str(token.expiresAt))}
                      {token.revokedAt ? " · revoked" : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </PlatformPanel>
        </div>

        <PlatformPanel title="Subscription & provisioning state">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs uppercase text-slate-500">Subscription</p>
              {subscription ? (
                <PlatformDetailGrid
                  items={[
                    {
                      label: "Status",
                      value: (
                        <PlatformBadge tone={platformStatusTone(str(subscription.status))}>
                          {titleCaseStatus(str(subscription.status))}
                        </PlatformBadge>
                      ),
                    },
                    {
                      label: "Workspace",
                      value: subscription.workspaceId ? (
                        <Link
                          href={`/platform/workspaces/${str(subscription.workspaceId)}`}
                          className="text-emerald-400"
                        >
                          {str(subscription.workspaceId)}
                        </Link>
                      ) : (
                        "—"
                      ),
                    },
                    {
                      label: "Stripe subscription",
                      value: subscription.hasStripeSubscription ? "Present" : "None",
                    },
                  ]}
                />
              ) : (
                <p className="text-sm text-slate-400">No subscription linked.</p>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs uppercase text-slate-500">Provisioning</p>
              {provisioning ? (
                <PlatformDetailGrid
                  items={[
                    {
                      label: "Status",
                      value: (
                        <PlatformBadge tone={platformStatusTone(str(provisioning.status))}>
                          {titleCaseStatus(str(provisioning.status))}
                        </PlatformBadge>
                      ),
                    },
                    { label: "Attempts", value: str(provisioning.attemptCount) },
                    {
                      label: "Run",
                      value: (
                        <Link
                          href={`/platform/provisioning/${str(provisioning.id)}`}
                          className="text-emerald-400"
                        >
                          {str(provisioning.id)}
                        </Link>
                      ),
                    },
                    { label: "Last error", value: str(provisioning.lastError) },
                  ]}
                />
              ) : (
                <p className="text-sm text-slate-400">No provisioning run linked.</p>
              )}
            </div>
          </div>
        </PlatformPanel>
      </div>
    </>
  );
}
