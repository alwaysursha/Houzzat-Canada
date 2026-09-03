import {
  PlatformEmptyState,
  PlatformErrorState,
  PlatformPageHeader,
  PlatformPagination,
  PlatformTableWrap,
} from "@/components/platform/PlatformUi";
import {
  listPlatformAuditEvents,
  PlatformApiClientError,
} from "@/lib/platform/ui/api-client";
import { formatPlatformDate, titleCaseStatus } from "@/lib/platform/ui/format";

type PageProps = {
  searchParams: Promise<{ cursor?: string; entityType?: string; action?: string }>;
};

type JsonRecord = Record<string, unknown>;

function str(value: unknown): string {
  if (value == null || value === "") return "—";
  return String(value);
}

export default async function PlatformAuditPage({ searchParams }: PageProps) {
  const params = await searchParams;
  let page;
  let errorMessage: string | null = null;

  try {
    page = await listPlatformAuditEvents({
      cursor: params.cursor ?? null,
      entityType: params.entityType ?? null,
      action: params.action ?? null,
      limit: 50,
    });
  } catch (error) {
    errorMessage =
      error instanceof PlatformApiClientError
        ? error.message
        : "Unable to load platform audit events.";
  }

  return (
    <>
      <PlatformPageHeader
        title="Platform audit"
        description="PlatformAuditEvent stream only — not tenant activity logs."
      />

      {errorMessage ? (
        <PlatformErrorState title="Audit log unavailable" message={errorMessage} />
      ) : page && page.items.length === 0 ? (
        <PlatformEmptyState message="No platform audit events yet." />
      ) : page ? (
        <>
          <PlatformTableWrap>
            <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-[#111827]">
              {page.items.map((row) => {
                const item = row as JsonRecord;
                return (
                  <tr key={str(item.id)} className="hover:bg-slate-800/40">
                    <td className="px-4 py-3 text-slate-400">
                      {formatPlatformDate(str(item.createdAt))}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      <p>{titleCaseStatus(str(item.actorType))}</p>
                      <p className="text-xs text-slate-500">
                        {str(item.actorOperatorId).slice(0, 8)}…
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-200">{str(item.action)}</td>
                    <td className="px-4 py-3 text-slate-300">
                      <p>{str(item.entityType)}</p>
                      <p className="text-xs text-slate-500">{str(item.entityId)}</p>
                    </td>
                    <td className="max-w-md px-4 py-3 text-slate-400">
                      {str(item.summary)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </PlatformTableWrap>
          <PlatformPagination
            basePath="/platform/audit"
            nextCursor={page.nextCursor}
            searchParams={{
              entityType: params.entityType,
              action: params.action,
            }}
          />
        </>
      ) : null}
    </>
  );
}
