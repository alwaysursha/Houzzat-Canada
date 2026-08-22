import { notFound, redirect } from "next/navigation";
import { staffSignInRedirectUrl } from "@/lib/auth/staff-sign-in-redirect";
import { canAccessLead, requireAgentContext } from "@/lib/agent";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

/** Deep links open the leads desk with the profile popup — no separate full page. */
export default async function AgentLeadDetailPage({ params }: Params) {
  const ctx = await requireAgentContext();
  if (!ctx) redirect(await staffSignInRedirectUrl("/agent/leads"));

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

  redirect(`/agent/leads?lead=${encodeURIComponent(id)}`);
}
