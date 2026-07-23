import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { HandoffClient } from "@/components/agent/HandoffClient";
import { LeadActions } from "@/components/agent/LeadActions";
import { IntentTimeline } from "@/components/crm/IntentTimeline";
import { canManageAllLeads, requireAgentUser } from "@/lib/agent";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export default async function AgentLeadDetailPage({ params }: Params) {
  const agent = await requireAgentUser();
  if (!agent) redirect("/auth/sign-in?callbackUrl=/agent/leads");
  const { id } = await params;

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      activities: { orderBy: { createdAt: "desc" }, take: 40 },
      appointments: { orderBy: { createdAt: "desc" } },
      customer: true,
      assignedAgent: true,
      adCampaign: { select: { id: true, name: true } },
    },
  });

  if (!lead) notFound();

  if (
    !canManageAllLeads(agent.role) &&
    lead.assignedAgentId &&
    lead.assignedAgentId !== agent.id
  ) {
    redirect("/agent/leads");
  }

  return (
    <div className="space-y-6">
      <Link href="/agent/leads" className="text-sm text-canopy">
        ← Pipeline
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl text-ink">
            {lead.source.replaceAll("_", " ")}
          </h1>
          <p className="mt-2 text-sm text-ink/60">
            {lead.listingMls ? (
              <Link href={`/listing/${lead.listingMls}`} className="text-canopy">
                {lead.listingMls}
              </Link>
            ) : (
              "No listing"
            )}{" "}
            · score {lead.score}
            {lead.contactConsentAt ? (
              <>
                {" "}
                ·{" "}
                <span className="font-medium text-canopy-deep">
                  Agent contact consent{" "}
                  {lead.contactConsentAt.toLocaleString("en-CA")}
                </span>
              </>
            ) : null}
          </p>
        </div>
        <LeadActions
          leadId={lead.id}
          status={lead.status}
          canClaim={!lead.assignedAgentId}
        />
      </div>

      <HandoffClient leadId={lead.id} />

      <pre className="whitespace-pre-wrap rounded-2xl border border-line bg-surface p-4 text-sm text-ink/80">
        {lead.notes ?? "No notes"}
      </pre>

      {lead.utmSource || lead.utmCampaign || lead.adCampaign ? (
        <section className="rounded-2xl border border-line bg-surface p-4 text-sm">
          <h2 className="font-semibold">Ad attribution</h2>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {lead.adCampaign ? (
              <div>
                <dt className="text-ink/45">Campaign</dt>
                <dd className="font-medium">{lead.adCampaign.name}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-ink/45">utm_source</dt>
              <dd className="font-medium">{lead.utmSource ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-ink/45">utm_campaign</dt>
              <dd className="font-medium">{lead.utmCampaign ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-ink/45">utm_content</dt>
              <dd className="font-medium">{lead.utmContent ?? "—"}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="font-semibold">Appointments</h2>
        <ul className="space-y-2 text-sm">
          {lead.appointments.map((a) => (
            <li key={a.id} className="rounded-xl border border-line bg-surface px-4 py-3">
              {a.type.replaceAll("_", " ")} · {a.status}
              {a.videoJoinUrl ? (
                <>
                  {" · "}
                  <a href={a.videoJoinUrl} className="text-canopy">
                    join link
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Intent timeline</h2>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <IntentTimeline
            events={lead.activities.map((a) => ({
              id: a.id,
              type: a.type,
              body: a.body,
              createdAt: a.createdAt,
            }))}
          />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Activity</h2>
        <ul className="space-y-2 text-sm">
          {lead.activities.map((activity) => (
            <li
              key={activity.id}
              className="border-b border-line py-2 text-ink/70"
            >
              <span className="font-medium text-ink">{activity.type}</span>
              {activity.body ? ` — ${activity.body}` : ""}
              <span className="ml-2 text-xs text-ink/40">
                {activity.createdAt.toLocaleString("en-CA")}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
