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
  listPlatformOffers,
  PlatformApiClientError,
} from "@/lib/platform/ui/api-client";
import { formatCents, formatPlatformDate, titleCaseStatus } from "@/lib/platform/ui/format";
import { platformStatusTone } from "@/lib/platform/ui/status-tone";

type PageProps = {
  searchParams: Promise<{ cursor?: string; status?: string }>;
};

type JsonRecord = Record<string, unknown>;

function str(value: unknown): string {
  if (value == null || value === "") return "—";
  return String(value);
}

export default async function PlatformOffersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  let page;
  let errorMessage: string | null = null;

  try {
    page = await listPlatformOffers({
      cursor: params.cursor ?? null,
      status: params.status ?? null,
      limit: 25,
    });
  } catch (error) {
    errorMessage =
      error instanceof PlatformApiClientError
        ? error.message
        : "Unable to load offers.";
  }

  return (
    <>
      <PlatformPageHeader
        title="Commercial offers"
        description="Negotiated private sales offers. Token secrets are never displayed."
      >
        <Link
          href="/platform/offers/new"
          className="inline-flex rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
        >
          + New Offer
        </Link>
      </PlatformPageHeader>

      {errorMessage ? (
        <PlatformErrorState title="Offers unavailable" message={errorMessage} />
      ) : page && page.items.length === 0 ? (
        <PlatformEmptyState message="No commercial offers yet." />
      ) : page ? (
        <>
          <PlatformTableWrap>
            <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Offer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Cadence</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Seats</th>
                <th className="px-4 py-3">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-[#111827]">
              {page.items.map((row) => {
                const item = row as JsonRecord;
                const amount =
                  item.negotiatedRecurringAmountCents ?? item.standardRecurringAmountCents;
                return (
                  <tr key={str(item.id)} className="hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <Link
                        href={`/platform/offers/${str(item.id)}`}
                        className="font-medium text-emerald-400 hover:text-emerald-300"
                      >
                        {str(item.id).slice(0, 8)}…
                      </Link>
                      <p className="text-xs text-slate-500">
                        Prospect {str(item.prospectId).slice(0, 8)}…
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <PlatformBadge tone={platformStatusTone(str(item.status))}>
                        {titleCaseStatus(str(item.status))}
                      </PlatformBadge>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{str(item.planCode)}</td>
                    <td className="px-4 py-3 text-slate-300">
                      {str(item.billingCadence)}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {formatCents(amount as number | null)}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {str(item.includedSeats)} + {str(item.additionalSeats)}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {formatPlatformDate(str(item.expiresAt))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </PlatformTableWrap>
          <PlatformPagination
            basePath="/platform/offers"
            nextCursor={page.nextCursor}
            searchParams={{ status: params.status }}
          />
        </>
      ) : null}
    </>
  );
}
