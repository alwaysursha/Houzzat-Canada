import { redirect } from "next/navigation";
import { LeadRoutingAdminClient } from "@/components/admin/LeadRoutingAdminClient";
import { resolveAdminPageSurface } from "@/lib/admin/resolve-admin-page-surface";
import {
  ensureCrmRoutingSettings,
  listRoutableAgentsForSettings,
  loadCrmRoutingSettingsForWorkspace,
} from "@/lib/crm-routing-config";

export const metadata = { title: "Lead routing" };

export default async function AdminLeadRoutingPage() {
  const surface = await resolveAdminPageSurface();
  if (surface.kind === "deny") redirect("/agent");

  if (surface.kind === "tenant") {
    const settings = await loadCrmRoutingSettingsForWorkspace(
      surface.auth.workspaceId,
    );
    if (!settings) {
      return (
        <div className="space-y-4">
          <h1 className="font-display text-3xl tracking-tight text-ink">
            Lead routing
          </h1>
          <p className="max-w-xl text-sm text-ink/60">
            No routing settings are provisioned for{" "}
            {surface.auth.brand.displayName} yet. Contact HouzzatPRO support to
            enable workspace routing — we will not fall back to another
            tenant&apos;s configuration.
          </p>
        </div>
      );
    }
    const agents = await listRoutableAgentsForSettings(settings);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-ink sm:text-4xl">
            Lead routing
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink/60">
            Auto-assign new buyer and seller leads for{" "}
            {surface.auth.brand.displayName} only. Eligible agents are ACTIVE
            workspace members.
          </p>
        </div>
        <LeadRoutingAdminClient
          initial={{
            agents,
            listingAgentId: settings.listingAgentId,
            sellerAssignMode: settings.sellerAssignMode,
            buyerWeights: settings.weights
              .filter((w) => w.lane === "BUYER")
              .map((w) => ({
                agentId: w.agentId,
                percent: w.percent,
                assignedCount: w.assignedCount,
                agent: w.agent,
              })),
            sellerWeights: settings.weights
              .filter((w) => w.lane === "SELLER")
              .map((w) => ({
                agentId: w.agentId,
                percent: w.percent,
                assignedCount: w.assignedCount,
                agent: w.agent,
              })),
          }}
        />
      </div>
    );
  }

  const settings = await ensureCrmRoutingSettings();
  const agents = await listRoutableAgentsForSettings(settings);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight text-ink sm:text-4xl">
          Lead routing
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/60">
          Platform tooling surface. Prefer per-workspace routing on each tenant
          Command Centre.
        </p>
      </div>
      <LeadRoutingAdminClient
        initial={{
          agents,
          listingAgentId: settings.listingAgentId,
          sellerAssignMode: settings.sellerAssignMode,
          buyerWeights: settings.weights
            .filter((w) => w.lane === "BUYER")
            .map((w) => ({
              agentId: w.agentId,
              percent: w.percent,
              assignedCount: w.assignedCount,
              agent: w.agent,
            })),
          sellerWeights: settings.weights
            .filter((w) => w.lane === "SELLER")
            .map((w) => ({
              agentId: w.agentId,
              percent: w.percent,
              assignedCount: w.assignedCount,
              agent: w.agent,
            })),
        }}
      />
    </div>
  );
}
