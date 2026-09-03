import Link from "next/link";
import {
  PlatformBadge,
  PlatformEmptyState,
  PlatformErrorState,
  PlatformPageHeader,
  PlatformPagination,
  PlatformTableWrap,
} from "@/components/platform/PlatformUi";
import {
  listPlatformSubscriptions,
  PlatformApiClientError,
} from "@/lib/platform/ui/api-client";
import { formatCents, formatPlatformDate, titleCaseStatus } from "@/lib/platform/ui/format";
import { platformStatusTone } from "@/lib/platform/ui/status-tone";

type PageProps = {
  searchParams: Promise<{ cursor?: string; status?: string; source?: string }>;
};

type JsonRecord = Record<string, unknown>;

function str(value: unknown): string {
  if (value == null || value === "") return "—";
  return String(value);
}

export default async function PlatformSubscriptionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  let page;
  let errorMessage: string | null = null;

  try {
    page = await listPlatformSubscriptions({
      cursor: params.cursor ?? null,
      status: params.status ?? null,
      source: params.source ?? null,
      limit: 25,
    });
  } catch (error) {
    errorMessage =
      error instanceof PlatformApiClientError
        ? error.message
        : "Unable to load subscriptions.";
  }

  return (
    <>
      <PlatformPageHeader
        title="Subscriptions"
        description="Commercial subscription records with Stripe presence indicators only."
      />

      {errorMessage ? (
        <PlatformErrorState title="Subscriptions unavailable" message={errorMessage} />
      ) : page && page.items.length === 0 ? (
        <PlatformEmptyState message="No subscriptions found." />
      ) : page ? (
        <>
          <PlatformTableWrap>
            <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Workspace</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Plan / profile</th>
                <th className="px-4 py-3">Cadence</th>
                <th className="px-4 py-3">Seats</th>
                <th className="px-4 py-3">Stripe</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-[#111827]">
              {page.items.map((row) => {
                const item = row as JsonRecord;
                const stripeLabel = [
                  item.hasStripeCustomer ? "Customer" : null,
                  item.hasStripeSubscription ? "Sub" : null,
                  item.hasStripePrice ? "Price" : null,
                ]
                  .filter(Boolean)
                  .join(", ");
                return (
                  <tr key={str(item.id)} className="hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      {item.workspaceId ? (
                        <Link
                          href={`/platform/workspaces/${str(item.workspaceId)}`}
                          className="text-emerald-400 hover:text-emerald-300"
                        >
                          {str(item.workspaceId).slice(0, 8)}…
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {titleCaseStatus(str(item.source))}
                    </td>
                    <td className="px-4 py-3">
                      <PlatformBadge tone={platformStatusTone(str(item.status))}>
                        {titleCaseStatus(str(item.status))}
                      </PlatformBadge>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      <p>{str(item.planCode)}</p>
                      <p className="text-xs text-slate-500">
                        {str(item.entitlementProfileCode)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {str(item.billingCadence)}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {str(item.includedSeats)} + {str(item.additionalSeats)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {stripeLabel || "None"}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {formatPlatformDate(str(item.updatedAt))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </PlatformTableWrap>
          <PlatformPagination
            basePath="/platform/subscriptions"
            nextCursor={page.nextCursor}
            searchParams={{ status: params.status, source: params.source }}
          />
        </>
      ) : null}
    </>
  );
}
