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
  listPlatformProvisioningRuns,
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

export default async function PlatformProvisioningPage({ searchParams }: PageProps) {
  const params = await searchParams;
  let page;
  let errorMessage: string | null = null;

  try {
    page = await listPlatformProvisioningRuns({
      cursor: params.cursor ?? null,
      status: params.status ?? null,
      limit: 25,
    });
  } catch (error) {
    errorMessage =
      error instanceof PlatformApiClientError
        ? error.message
        : "Unable to load provisioning runs.";
  }

  return (
    <>
      <PlatformPageHeader
        title="Provisioning"
        description="Read-only provisioning run history. Failures are highlighted; no retry controls in this stage."
      />

      {errorMessage ? (
        <PlatformErrorState title="Provisioning unavailable" message={errorMessage} />
      ) : page && page.items.length === 0 ? (
        <PlatformEmptyState message="No provisioning runs recorded." />
      ) : page ? (
        <>
          <PlatformTableWrap>
            <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Run</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Workspace</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Completed</th>
                <th className="px-4 py-3">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-[#111827]">
              {page.items.map((row) => {
                const item = row as JsonRecord;
                const failed = String(item.status).toUpperCase() === "FAILED";
                return (
                  <tr
                    key={str(item.id)}
                    className={failed ? "bg-red-950/20 hover:bg-red-950/30" : "hover:bg-slate-800/40"}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/platform/provisioning/${str(item.id)}`}
                        className="font-medium text-emerald-400 hover:text-emerald-300"
                      >
                        {str(item.id).slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <PlatformBadge tone={platformStatusTone(str(item.status))}>
                        {titleCaseStatus(str(item.status))}
                      </PlatformBadge>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{str(item.attemptCount)}</td>
                    <td className="px-4 py-3 text-slate-300">
                      {item.workspaceId ? (
                        <Link
                          href={`/platform/workspaces/${str(item.workspaceId)}`}
                          className="text-emerald-400"
                        >
                          {str(item.workspaceId).slice(0, 8)}…
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {formatPlatformDate(str(item.startedAt))}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {formatPlatformDate(str(item.completedAt))}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-red-300">
                      {str(item.lastError)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </PlatformTableWrap>
          <PlatformPagination
            basePath="/platform/provisioning"
            nextCursor={page.nextCursor}
            searchParams={{ status: params.status }}
          />
        </>
      ) : null}
    </>
  );
}
