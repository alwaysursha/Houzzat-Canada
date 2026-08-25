import { redirect } from "next/navigation";
import { staffSignInRedirectUrl } from "@/lib/auth/staff-sign-in-redirect";
import { TeamAdminClient } from "@/components/agent/TeamAdminClient";
import { requireAgentContext } from "@/lib/agent";
import { prisma } from "@/lib/prisma";
import {
  getWorkspaceTeamPayload,
  usesWorkspaceTeamScope,
} from "@/lib/workspace-team";

export const metadata = { title: "Team · Agent CRM" };

export default async function AgentTeamPage() {
  const ctx = await requireAgentContext();
  if (!ctx) redirect(await staffSignInRedirectUrl("/agent/team"));

  if (usesWorkspaceTeamScope(ctx)) {
    const payload = await getWorkspaceTeamPayload(ctx);
    if (!payload?.workspace) {
      redirect("/agent/workspace");
    }

    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-4xl text-ink">Team</h1>
          <p className="mt-2 text-sm text-ink/60">
            {payload.workspace.name}
            {payload.workspace.brokerageAffiliation
              ? ` · ${payload.workspace.brokerageAffiliation}`
              : ""}
            {" · "}
            manage seats for this Workspace only. Platform Admin stays separate
            (Houzzat HQ).
          </p>
        </div>

        <TeamAdminClient
          scope="workspace"
          workspaceName={payload.workspace.name}
          canManage={payload.canManage}
          seatLimit={payload.seats.seatLimit}
          billingDeferred={payload.seats.billingDeferred}
          memberCount={payload.seats.activeSeatCount}
          currentUserId={ctx.user.id}
          primaryAgentUserId={payload.primaryAgentId}
          canSetPrimaryAgent={ctx.workspaceRole === "OWNER"}
          members={payload.members.map((m) => ({
            id: m.id,
            role: m.role,
            status: m.status,
            isPrimaryAgent: m.isPrimaryAgent,
            user: {
              id: m.user.id,
              name: m.user.name,
              email: m.user.email,
              agentActive: m.status === "ACTIVE",
            },
          }))}
          invites={payload.invites.map((i) => ({
            id: i.id,
            email: i.email,
            role: i.role,
            expiresAt: i.expiresAt.toISOString(),
          }))}
        />
      </div>
    );
  }

  const [org, members, invites] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
    }),
    prisma.organizationMembership.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            agentProfile: { select: { active: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.organizationInvite.findMany({
      where: {
        organizationId: ctx.organizationId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-ink">Team</h1>
        <p className="mt-2 text-sm text-ink/60">
          {org.name} · team leads manage seats; agents work their book. Platform
          Admin stays separate (Houzzat HQ).
        </p>
      </div>

      <TeamAdminClient
        scope="organization"
        canManage={ctx.canSeeTeamLeads}
        seatLimit={org.seatLimit}
        memberCount={members.length}
        currentUserId={ctx.user.id}
        members={members.map((m) => ({
          id: m.id,
          role: m.role,
          user: {
            id: m.user.id,
            name: m.user.name,
            email: m.user.email,
            agentActive: m.user.agentProfile?.active ?? true,
          },
        }))}
        invites={invites.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role,
          expiresAt: i.expiresAt.toISOString(),
        }))}
      />
    </div>
  );
}
