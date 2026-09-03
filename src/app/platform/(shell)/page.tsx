import Link from "next/link";
import {
  PlatformErrorState,
  PlatformPageHeader,
  PlatformPanel,
  PlatformStatCard,
  PlatformStatGrid,
} from "@/components/platform/PlatformUi";
import {
  getPlatformSummary,
  PlatformApiClientError,
} from "@/lib/platform/ui/api-client";
import { titleCaseStatus } from "@/lib/platform/ui/format";

function recordEntries(record: Record<string, number>): Array<[string, number]> {
  return Object.entries(record).sort((a, b) => b[1] - a[1]);
}

export default async function PlatformDashboardPage() {
  let summary;
  let errorMessage: string | null = null;
  try {
    summary = await getPlatformSummary();
  } catch (error) {
    errorMessage =
      error instanceof PlatformApiClientError
        ? error.message
        : "Unable to load platform summary.";
  }

  return (
    <>
      <PlatformPageHeader
        title="Dashboard"
        description="Read-only control-plane overview from platform APIs. No tenant CRM data is shown here."
      />

      {errorMessage ? (
        <PlatformErrorState title="Summary unavailable" message={errorMessage} />
      ) : summary ? (
        <div className="space-y-6">
          <PlatformStatGrid>
            <PlatformStatCard label="Workspaces" value={summary.workspaces.total} />
            <PlatformStatCard
              label="Active subscriptions"
              value={summary.subscriptions.active}
              hint={`${summary.subscriptions.total} total`}
            />
            <PlatformStatCard label="Platform prospects" value={summary.prospects.total} />
            <PlatformStatCard
              label="Seats consumed"
              value={summary.seats.totalConsumed}
              hint={`${summary.seats.totalProvisioned} provisioned limit`}
            />
          </PlatformStatGrid>

          <div className="grid gap-6 xl:grid-cols-2">
            <PlatformPanel title="Workspace status">
              <ul className="space-y-2 text-sm">
                {recordEntries(summary.workspaces.byStatus).map(([status, count]) => (
                  <li
                    key={status}
                    className="flex items-center justify-between border-b border-slate-800/80 pb-2 last:border-0"
                  >
                    <span className="text-slate-300">{titleCaseStatus(status)}</span>
                    <span className="font-medium text-white">{count}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/platform/workspaces"
                className="mt-4 inline-block text-sm text-emerald-400 hover:text-emerald-300"
              >
                View workspaces →
              </Link>
            </PlatformPanel>

            <PlatformPanel title="Subscription distribution">
              <div className="space-y-4 text-sm">
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
                    By status
                  </p>
                  <ul className="space-y-1">
                    {recordEntries(summary.subscriptions.byStatus).map(([status, count]) => (
                      <li key={status} className="flex justify-between text-slate-300">
                        <span>{titleCaseStatus(status)}</span>
                        <span>{count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
                    By source
                  </p>
                  <ul className="space-y-1">
                    {recordEntries(summary.subscriptions.bySource).map(([source, count]) => (
                      <li key={source} className="flex justify-between text-slate-300">
                        <span>{titleCaseStatus(source)}</span>
                        <span>{count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
                    By plan
                  </p>
                  <ul className="space-y-1">
                    {recordEntries(summary.subscriptions.byPlanCode).map(([plan, count]) => (
                      <li key={plan} className="flex justify-between text-slate-300">
                        <span>{plan}</span>
                        <span>{count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </PlatformPanel>

            <PlatformPanel title="Prospects by status">
              <ul className="space-y-2 text-sm">
                {recordEntries(summary.prospects.byStatus).map(([status, count]) => (
                  <li key={status} className="flex justify-between text-slate-300">
                    <span>{titleCaseStatus(status)}</span>
                    <span>{count}</span>
                  </li>
                ))}
              </ul>
            </PlatformPanel>

            <PlatformPanel title="Seats & add-ons">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-slate-500">Included seats</dt>
                  <dd className="text-white">{summary.seats.totalIncludedSeats}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Additional seats</dt>
                  <dd className="text-white">{summary.seats.totalAdditionalSeats}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Provisioned limit</dt>
                  <dd className="text-white">{summary.seats.totalProvisioned}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Consumed</dt>
                  <dd className="text-white">{summary.seats.totalConsumed}</dd>
                </div>
              </dl>
              <div className="mt-4 space-y-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Add-on grants
                </p>
                {recordEntries(summary.addOnGrants.byStatus).map(([status, count]) => (
                  <div key={status} className="flex justify-between text-slate-300">
                    <span>{titleCaseStatus(status)}</span>
                    <span>{count}</span>
                  </div>
                ))}
              </div>
            </PlatformPanel>

            <PlatformPanel title="Provisioning runs">
              <ul className="space-y-2 text-sm">
                {recordEntries(summary.provisioning.byStatus).map(([status, count]) => (
                  <li key={status} className="flex justify-between text-slate-300">
                    <span>{titleCaseStatus(status)}</span>
                    <span>{count}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/platform/provisioning"
                className="mt-4 inline-block text-sm text-emerald-400 hover:text-emerald-300"
              >
                View provisioning →
              </Link>
            </PlatformPanel>
          </div>
        </div>
      ) : null}
    </>
  );
}
