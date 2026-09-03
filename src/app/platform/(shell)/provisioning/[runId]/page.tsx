import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformDetailGrid } from "@/components/platform/PlatformDetailGrid";
import {
  PlatformBadge,
  PlatformErrorState,
  PlatformPageHeader,
  PlatformPanel,
  PlatformTableWrap,
} from "@/components/platform/PlatformUi";
import {
  getPlatformProvisioningRun,
  PlatformApiClientError,
} from "@/lib/platform/ui/api-client";
import { formatPlatformDate, titleCaseStatus } from "@/lib/platform/ui/format";
import { platformStatusTone } from "@/lib/platform/ui/status-tone";

type PageProps = {
  params: Promise<{ runId: string }>;
};

type JsonRecord = Record<string, unknown>;

function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? (value as JsonRecord[]) : [];
}

function str(value: unknown): string {
  if (value == null || value === "") return "—";
  return String(value);
}

export default async function PlatformProvisioningDetailPage({ params }: PageProps) {
  const { runId } = await params;
  let run: JsonRecord | null = null;
  let errorMessage: string | null = null;

  try {
    run = (await getPlatformProvisioningRun(runId)) as JsonRecord;
  } catch (error) {
    if (error instanceof PlatformApiClientError && error.status === 404) {
      notFound();
    }
    errorMessage =
      error instanceof PlatformApiClientError
        ? error.message
        : "Unable to load provisioning run.";
  }

  if (errorMessage) {
    return (
      <>
        <PlatformPageHeader title="Provisioning run" />
        <PlatformErrorState title="Run unavailable" message={errorMessage} />
      </>
    );
  }

  if (!run) notFound();

  const failed = String(run.status).toUpperCase() === "FAILED";

  return (
    <>
      <PlatformPageHeader
        title={`Provisioning ${str(run.id).slice(0, 8)}…`}
        description="Read-only provisioning run detail with sanitized errors."
      />

      <div className="space-y-6">
        {failed && run.lastError ? (
          <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            <p className="font-semibold text-red-300">Provisioning failed</p>
            <p className="mt-1">{str(run.lastError)}</p>
          </div>
        ) : null}

        <PlatformPanel title="Run summary">
          <PlatformDetailGrid
            items={[
              { label: "Run ID", value: str(run.id) },
              {
                label: "Status",
                value: (
                  <PlatformBadge tone={platformStatusTone(str(run.status))}>
                    {titleCaseStatus(str(run.status))}
                  </PlatformBadge>
                ),
              },
              { label: "Attempts", value: str(run.attemptCount) },
              {
                label: "Workspace",
                value: run.workspaceId ? (
                  <Link
                    href={`/platform/workspaces/${str(run.workspaceId)}`}
                    className="text-emerald-400"
                  >
                    {str(run.workspaceId)}
                  </Link>
                ) : (
                  "—"
                ),
              },
              { label: "Offer ID", value: str(run.offerId) },
              { label: "Subscription ID", value: str(run.subscriptionId) },
              { label: "Started", value: formatPlatformDate(str(run.startedAt)) },
              { label: "Completed", value: formatPlatformDate(str(run.completedAt)) },
              { label: "Created", value: formatPlatformDate(str(run.createdAt)) },
            ]}
          />
        </PlatformPanel>

        <PlatformPanel title="Steps">
          {asArray(run.steps).length === 0 ? (
            <p className="text-sm text-slate-400">No steps recorded.</p>
          ) : (
            <PlatformTableWrap>
              <thead className="bg-slate-900/60 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-2">Step</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Attempts</th>
                  <th className="px-4 py-2">Output ref</th>
                  <th className="px-4 py-2">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {asArray(run.steps).map((step) => {
                  const stepFailed = String(step.status).toUpperCase() === "FAILED";
                  return (
                    <tr
                      key={str(step.id)}
                      className={stepFailed ? "bg-red-950/20" : undefined}
                    >
                      <td className="px-4 py-2 text-slate-200">{str(step.stepKey)}</td>
                      <td className="px-4 py-2">
                        <PlatformBadge tone={platformStatusTone(str(step.status))}>
                          {titleCaseStatus(str(step.status))}
                        </PlatformBadge>
                      </td>
                      <td className="px-4 py-2 text-slate-300">
                        {str(step.attemptCount)}
                      </td>
                      <td className="px-4 py-2 text-slate-400">{str(step.outputRef)}</td>
                      <td className="max-w-xs truncate px-4 py-2 text-red-300">
                        {str(step.lastError)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </PlatformTableWrap>
          )}
        </PlatformPanel>
      </div>
    </>
  );
}
