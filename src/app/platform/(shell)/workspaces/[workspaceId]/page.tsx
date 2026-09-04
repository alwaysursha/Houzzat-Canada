import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformDetailGrid, PlatformSection } from "@/components/platform/PlatformDetailGrid";
import { PlatformOwnerActivationActions } from "@/components/platform/PlatformOwnerActivationActions";
import { PlatformWorkspaceActions } from "@/components/platform/PlatformWorkspaceActions";
import {
  PlatformBadge,
  PlatformErrorState,
  PlatformPageHeader,
  PlatformPanel,
  PlatformTableWrap,
} from "@/components/platform/PlatformUi";
import {
  getPlatformWorkspace,
  PlatformApiClientError,
} from "@/lib/platform/ui/api-client";
import { formatCents, formatPlatformDate, titleCaseStatus } from "@/lib/platform/ui/format";
import { platformStatusTone } from "@/lib/platform/ui/status-tone";

type PageProps = {
  params: Promise<{ workspaceId: string }>;
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

export default async function PlatformWorkspaceDetailPage({ params }: PageProps) {
  const { workspaceId } = await params;
  let workspace: JsonRecord | null = null;
  let errorMessage: string | null = null;

  try {
    workspace = (await getPlatformWorkspace(workspaceId)) as JsonRecord;
  } catch (error) {
    if (error instanceof PlatformApiClientError && error.status === 404) {
      notFound();
    }
    errorMessage =
      error instanceof PlatformApiClientError
        ? error.message
        : "Unable to load workspace detail.";
  }

  if (errorMessage) {
    return (
      <>
        <PlatformPageHeader title="Workspace" />
        <PlatformErrorState title="Workspace unavailable" message={errorMessage} />
      </>
    );
  }

  if (!workspace) notFound();

  const subscription = asRecord(workspace.currentSubscription);
  const seatQuota = asRecord(workspace.seatQuota);
  const seatConsumption = asRecord(workspace.seatConsumption);
  const billingCustomer = asRecord(workspace.billingCustomer);
  const emailIdentity = asRecord(workspace.emailIdentity);
  const brandingDetail = asRecord(workspace.brandingDetail);

  return (
    <>
      <PlatformPageHeader
        title={str(workspace.name)}
        description={`Workspace ${str(workspace.slug)} · platform control-plane view`}
      />

      <div className="space-y-6">
        <PlatformOwnerActivationActions
          workspaceId={str(workspace.id)}
          canSendOwnerActivation={Boolean(workspace.canSendOwnerActivation)}
          activationEligibilityReason={
            workspace.ownerActivationEligibilityReason
              ? str(workspace.ownerActivationEligibilityReason)
              : null
          }
        />

        <PlatformWorkspaceActions
          workspaceId={str(workspace.id)}
          workspaceName={str(workspace.name)}
          status={str(workspace.status)}
          statusEvents={asArray(workspace.statusEvents).map((event) => ({
            toStatus: str(event.toStatus),
            reasonCode: str(event.reasonCode),
          }))}
        />

        <PlatformPanel title="Overview">
          <PlatformDetailGrid
            items={[
              { label: "Workspace ID", value: str(workspace.id) },
              { label: "Slug", value: str(workspace.slug) },
              {
                label: "Status",
                value: (
                  <PlatformBadge tone={platformStatusTone(str(workspace.status))}>
                    {titleCaseStatus(str(workspace.status))}
                  </PlatformBadge>
                ),
              },
              { label: "Created", value: formatPlatformDate(str(workspace.createdAt)) },
              {
                label: "Entitlements enabled",
                value: str(workspace.entitlementsEnabledCount),
              },
              {
                label: "Theme ID",
                value: str(brandingDetail?.themeId ?? asRecord(workspace.branding)?.themeId),
              },
            ]}
          />
        </PlatformPanel>

        <PlatformPanel title="Subscription">
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
                { label: "Source", value: titleCaseStatus(str(subscription.source)) },
                { label: "Plan", value: str(subscription.planCode) },
                { label: "Profile", value: str(subscription.entitlementProfileCode) },
                { label: "Cadence", value: str(subscription.billingCadence) },
                {
                  label: "Recurring",
                  value: formatCents(subscription.recurringAmountCents as number | null),
                },
                {
                  label: "Stripe customer",
                  value: subscription.hasStripeCustomer ? "Present" : "None",
                },
                {
                  label: "Stripe subscription",
                  value: subscription.hasStripeSubscription ? "Present" : "None",
                },
              ]}
            />
          ) : (
            <p className="text-sm text-slate-400">No active subscription record.</p>
          )}
        </PlatformPanel>

        <PlatformPanel title="Entitlements">
          {asArray(workspace.entitlements).length === 0 ? (
            <p className="text-sm text-slate-400">No entitlements materialized.</p>
          ) : (
            <PlatformTableWrap>
              <thead className="bg-slate-900/60 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-2">Feature</th>
                  <th className="px-4 py-2">Enabled</th>
                  <th className="px-4 py-2">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {asArray(workspace.entitlements).map((row) => (
                  <tr key={str(row.id)}>
                    <td className="px-4 py-2 text-slate-200">{str(row.featureCode)}</td>
                    <td className="px-4 py-2 text-slate-300">
                      {row.enabled ? "Yes" : "No"}
                    </td>
                    <td className="px-4 py-2 text-slate-400">{str(row.source)}</td>
                  </tr>
                ))}
              </tbody>
            </PlatformTableWrap>
          )}
        </PlatformPanel>

        <div className="grid gap-6 lg:grid-cols-2">
          <PlatformPanel title="Seats">
            <PlatformDetailGrid
              items={[
                { label: "Included", value: str(seatQuota?.includedSeats ?? "—") },
                { label: "Additional", value: str(seatQuota?.additionalSeats ?? "—") },
                { label: "Limit", value: str(seatQuota?.seatLimit ?? "—") },
                { label: "Consumed", value: str(seatConsumption?.consumed ?? "—") },
                {
                  label: "Active members",
                  value: str(seatConsumption?.activeMembers ?? "—"),
                },
                {
                  label: "Pending invites",
                  value: str(seatConsumption?.pendingUnexpiredInvites ?? "—"),
                },
              ]}
            />
          </PlatformPanel>

          <PlatformPanel title="Add-ons">
            {asArray(workspace.addOnGrants).length === 0 ? (
              <p className="text-sm text-slate-400">No add-on grants.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {asArray(workspace.addOnGrants).map((grant) => (
                  <li
                    key={str(grant.id)}
                    className="flex items-center justify-between border-b border-slate-800 pb-2"
                  >
                    <span className="text-slate-200">{str(grant.addOnCode)}</span>
                    <PlatformBadge tone={platformStatusTone(str(grant.status))}>
                      {titleCaseStatus(str(grant.status))}
                    </PlatformBadge>
                  </li>
                ))}
              </ul>
            )}
          </PlatformPanel>
        </div>

        <PlatformPanel title="Email identity">
          {emailIdentity ? (
            <PlatformDetailGrid
              items={[
                { label: "Contact email", value: str(emailIdentity.contactEmail) },
                { label: "Reply-to", value: str(emailIdentity.replyToEmail) },
                { label: "Sender name", value: str(emailIdentity.senderDisplayName) },
                { label: "Custom domain", value: str(emailIdentity.customDomain) },
                { label: "Domain status", value: str(emailIdentity.domainStatus) },
              ]}
            />
          ) : (
            <p className="text-sm text-slate-400">No email identity configured.</p>
          )}
        </PlatformPanel>

        <PlatformPanel title="Domains">
          {asArray(workspace.domains).length === 0 ? (
            <p className="text-sm text-slate-400">No domains registered.</p>
          ) : (
            <PlatformTableWrap>
              <thead className="bg-slate-900/60 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-2">Hostname</th>
                  <th className="px-4 py-2">Kind</th>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {asArray(workspace.domains).map((domain) => (
                  <tr key={str(domain.id)}>
                    <td className="px-4 py-2 text-slate-200">{str(domain.hostname)}</td>
                    <td className="px-4 py-2 text-slate-400">{str(domain.kind)}</td>
                    <td className="px-4 py-2 text-slate-400">{str(domain.role)}</td>
                    <td className="px-4 py-2">
                      <PlatformBadge tone={platformStatusTone(str(domain.status))}>
                        {titleCaseStatus(str(domain.status))}
                      </PlatformBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </PlatformTableWrap>
          )}
        </PlatformPanel>

        <PlatformPanel title="Provisioning runs">
          {asArray(workspace.provisioningRuns).length === 0 ? (
            <p className="text-sm text-slate-400">No provisioning runs for this workspace.</p>
          ) : (
            <PlatformTableWrap>
              <thead className="bg-slate-900/60 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-2">Run</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Attempts</th>
                  <th className="px-4 py-2">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {asArray(workspace.provisioningRuns).map((run) => (
                  <tr key={str(run.id)}>
                    <td className="px-4 py-2">
                      <Link
                        href={`/platform/provisioning/${str(run.id)}`}
                        className="text-emerald-400 hover:text-emerald-300"
                      >
                        {str(run.id).slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <PlatformBadge tone={platformStatusTone(str(run.status))}>
                        {titleCaseStatus(str(run.status))}
                      </PlatformBadge>
                    </td>
                    <td className="px-4 py-2 text-slate-300">{str(run.attemptCount)}</td>
                    <td className="max-w-xs truncate px-4 py-2 text-red-300">
                      {str(run.lastError)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </PlatformTableWrap>
          )}
        </PlatformPanel>

        <PlatformPanel title="Workspace status history">
          {asArray(workspace.statusEvents).length === 0 ? (
            <p className="text-sm text-slate-400">No status events recorded.</p>
          ) : (
            <PlatformTableWrap>
              <thead className="bg-slate-900/60 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">Transition</th>
                  <th className="px-4 py-2">Reason</th>
                  <th className="px-4 py-2">Actor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {asArray(workspace.statusEvents).map((event) => (
                  <tr key={str(event.id)}>
                    <td className="px-4 py-2 text-slate-400">
                      {formatPlatformDate(str(event.createdAt))}
                    </td>
                    <td className="px-4 py-2 text-slate-200">
                      {str(event.fromStatus)} → {str(event.toStatus)}
                    </td>
                    <td className="px-4 py-2 text-slate-300">{str(event.reasonCode)}</td>
                    <td className="px-4 py-2 text-slate-400">{str(event.actorType)}</td>
                  </tr>
                ))}
              </tbody>
            </PlatformTableWrap>
          )}
        </PlatformPanel>

        {billingCustomer ? (
          <PlatformSection title="Billing customer">
            <PlatformDetailGrid
              items={[
                { label: "Email", value: str(billingCustomer.email) },
                { label: "Source", value: str(billingCustomer.source) },
                {
                  label: "Stripe customer",
                  value: billingCustomer.hasStripeCustomer ? "Present" : "None",
                },
              ]}
            />
          </PlatformSection>
        ) : null}
      </div>
    </>
  );
}
