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
  listPlatformWorkspaces,
  PlatformApiClientError,
} from "@/lib/platform/ui/api-client";
import { formatPlatformDate, titleCaseStatus } from "@/lib/platform/ui/format";
import { platformStatusTone } from "@/lib/platform/ui/status-tone";
import type { PlatformWorkspaceListItem } from "@/lib/platform/ui/types";

type PageProps = {
  searchParams: Promise<{ cursor?: string; status?: string }>;
};

function seatLabel(row: PlatformWorkspaceListItem): string {
  const consumed = row.seatConsumption.consumed;
  const limit = row.seatQuota?.seatLimit;
  if (limit == null) return `${consumed} / —`;
  return `${consumed} / ${limit}`;
}

export default async function PlatformWorkspacesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  let page;
  let errorMessage: string | null = null;

  try {
    page = await listPlatformWorkspaces({
      cursor: params.cursor ?? null,
      status: params.status ?? null,
      limit: 25,
    });
  } catch (error) {
    errorMessage =
      error instanceof PlatformApiClientError
        ? error.message
        : "Unable to load workspaces.";
  }

  return (
    <>
      <PlatformPageHeader
        title="Workspaces"
        description="Tenant workspaces with commercial metadata only. Read-only — no suspend or edit controls."
      />

      {errorMessage ? (
        <PlatformErrorState title="Workspaces unavailable" message={errorMessage} />
      ) : page && page.items.length === 0 ? (
        <PlatformEmptyState message="No workspaces match the current filters." />
      ) : page ? (
        <>
          <PlatformTableWrap>
            <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Workspace</th>
                <th className="px-4 py-3">Domain</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Subscription</th>
                <th className="px-4 py-3">Profile / plan</th>
                <th className="px-4 py-3">Seats</th>
                <th className="px-4 py-3">Theme ID</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-[#111827]">
              {page.items.map((row) => (
                <tr key={row.id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/platform/workspaces/${row.id}`}
                      className="font-medium text-emerald-400 hover:text-emerald-300"
                    >
                      {row.name}
                    </Link>
                    <p className="text-xs text-slate-500">{row.slug}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {row.primaryDomain?.hostname ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <PlatformBadge tone={platformStatusTone(row.status)}>
                      {titleCaseStatus(row.status)}
                    </PlatformBadge>
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {row.currentSubscription ? (
                      <PlatformBadge
                        tone={platformStatusTone(row.currentSubscription.status)}
                      >
                        {titleCaseStatus(row.currentSubscription.status)}
                      </PlatformBadge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    <p>{row.entitlementProfileCode ?? "—"}</p>
                    <p className="text-xs text-slate-500">
                      {row.currentSubscription?.planCode ?? "No plan"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{seatLabel(row)}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {row.branding?.themeId ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {formatPlatformDate(row.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </PlatformTableWrap>
          <PlatformPagination
            basePath="/platform/workspaces"
            nextCursor={page.nextCursor}
            searchParams={{ status: params.status }}
          />
        </>
      ) : null}
    </>
  );
}
