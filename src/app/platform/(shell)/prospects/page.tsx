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
  listPlatformProspects,
  PlatformApiClientError,
} from "@/lib/platform/ui/api-client";
import { formatPlatformDate, titleCaseStatus } from "@/lib/platform/ui/format";
import { platformStatusTone } from "@/lib/platform/ui/status-tone";

type PageProps = {
  searchParams: Promise<{ cursor?: string; status?: string }>;
};

type JsonRecord = Record<string, unknown>;

function str(value: unknown): string {
  if (value == null || value === "") return "—";
  return String(value);
}

export default async function PlatformProspectsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  let page;
  let errorMessage: string | null = null;

  try {
    page = await listPlatformProspects({
      cursor: params.cursor ?? null,
      status: params.status ?? null,
      limit: 25,
    });
  } catch (error) {
    errorMessage =
      error instanceof PlatformApiClientError
        ? error.message
        : "Unable to load platform prospects.";
  }

  return (
    <>
      <PlatformPageHeader
        title="Platform prospects"
        description="Sales pipeline prospects for HouzzatPRO — not tenant CRM leads."
      />

      {errorMessage ? (
        <PlatformErrorState title="Prospects unavailable" message={errorMessage} />
      ) : page && page.items.length === 0 ? (
        <PlatformEmptyState message="No platform prospects yet." />
      ) : page ? (
        <>
          <PlatformTableWrap>
            <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Contact / business</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Brokerage</th>
                <th className="px-4 py-3">Team size</th>
                <th className="px-4 py-3">Owner operator</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-[#111827]">
              {page.items.map((row) => {
                const item = row as JsonRecord;
                const owner = item.ownerOperator as JsonRecord | null;
                return (
                  <tr key={str(item.id)} className="hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <Link
                        href={`/platform/prospects/${str(item.id)}`}
                        className="font-medium text-emerald-400 hover:text-emerald-300"
                      >
                        {str(item.businessName)}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {str(item.contactName)} · {str(item.email)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <PlatformBadge tone={platformStatusTone(str(item.status))}>
                        {titleCaseStatus(str(item.status))}
                      </PlatformBadge>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {titleCaseStatus(str(item.source))}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {str(item.brokerageName)}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {str(item.estimatedTeamSize)}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {owner ? `${str(owner.role)} (${str(owner.status)})` : "—"}
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
            basePath="/platform/prospects"
            nextCursor={page.nextCursor}
            searchParams={{ status: params.status }}
          />
        </>
      ) : null}
    </>
  );
}
