import { notFound, redirect } from "next/navigation";
import { CustomerProfile } from "@/components/agent/CustomerProfile";
import { canAccessLead, requireAgentContext } from "@/lib/agent";
import { loadLeadSummary } from "@/lib/agent/lead-summary";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export default async function AgentLeadDetailPage({ params }: Params) {
  const ctx = await requireAgentContext();
  if (!ctx) redirect("/auth/sign-in?callbackUrl=/agent/leads");

  const { id } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id },
    select: {
      id: true,
      organizationId: true,
      assignedAgentId: true,
    },
  });
  if (!lead || !canAccessLead(ctx, lead)) notFound();

  const initialData = await loadLeadSummary(ctx, id);
  if (!initialData) notFound();

  return (
    <div className="h-dvh w-full">
      <CustomerProfile
        leadId={id}
        variant="page"
        initialData={initialData}
      />
    </div>
  );
}
