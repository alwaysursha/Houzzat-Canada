import { LeadRoutingAdminClient } from "@/components/admin/LeadRoutingAdminClient";
import {
  ensureCrmRoutingSettings,
  listRoutableAgents,
} from "@/lib/agent/lead-intake";

export const metadata = { title: "Lead routing" };

export default async function AdminLeadRoutingPage() {
  const [settings, agents] = await Promise.all([
    ensureCrmRoutingSettings(),
    listRoutableAgents(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-ink">Lead routing</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/60">
          Auto-assign new buyer and seller leads. With one agent, every lead
          goes to them. With multiple agents, set percentage weights. Seller
          leads can default to your listing agent or use seller percentages.
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
