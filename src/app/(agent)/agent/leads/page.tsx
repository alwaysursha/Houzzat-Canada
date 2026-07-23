import Link from "next/link";
import { redirect } from "next/navigation";
import { LeadActions } from "@/components/agent/LeadActions";
import { canManageAllLeads, requireAgentUser } from "@/lib/agent";
import { prisma } from "@/lib/prisma";
import type { LeadStatus } from "@prisma/client";

export const metadata = { title: "Lead pipeline" };

const COLUMNS: LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "SHOWING",
  "OFFER",
  "CLIENT",
];

export default async function AgentLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ unassigned?: string }>;
}) {
  const agent = await requireAgentUser();
  if (!agent) redirect("/auth/sign-in?callbackUrl=/agent/leads");
  const params = await searchParams;

  const where = canManageAllLeads(agent.role)
    ? params.unassigned === "1"
      ? { assignedAgentId: null }
      : {}
    : params.unassigned === "1"
      ? { assignedAgentId: null }
      : {
          OR: [{ assignedAgentId: agent.id }, { assignedAgentId: null }],
        };

  const leads = await prisma.lead.findMany({
    where,
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      customer: { select: { name: true, email: true } },
      assignedAgent: { select: { name: true, email: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl text-ink">Pipeline</h1>
          <p className="mt-2 text-sm text-ink/60">{leads.length} leads</p>
        </div>
        <Link href="/agent/leads" className="text-sm text-canopy">
          All
        </Link>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {COLUMNS.map((status) => {
          const columnLeads = leads.filter((l) => l.status === status);
          return (
            <div
              key={status}
              className="min-w-[240px] flex-1 rounded-2xl border border-line bg-surface/80 p-3"
            >
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink/50">
                {status.replaceAll("_", " ")} · {columnLeads.length}
              </h2>
              <ul className="space-y-2">
                {columnLeads.map((lead) => (
                  <li
                    key={lead.id}
                    className="rounded-xl border border-line bg-white p-3 text-sm shadow-sm"
                  >
                    <Link
                      href={`/agent/leads/${lead.id}`}
                      className="font-semibold text-ink hover:text-canopy"
                    >
                      {lead.source.replaceAll("_", " ")}
                    </Link>
                    <p className="mt-1 text-xs text-ink/55">
                      {lead.listingMls ? (
                        <Link
                          href={`/listing/${lead.listingMls}`}
                          className="text-canopy"
                        >
                          {lead.listingMls}
                        </Link>
                      ) : (
                        "No listing"
                      )}{" "}
                      · score {lead.score}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-ink/60">
                      {lead.notes}
                    </p>
                    <div className="mt-2">
                      <LeadActions
                        leadId={lead.id}
                        status={lead.status}
                        canClaim={!lead.assignedAgentId}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
