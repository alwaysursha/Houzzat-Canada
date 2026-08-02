import Link from "next/link";
import { redirect } from "next/navigation";
import { leadScopeWhere, requireAgentContext } from "@/lib/agent";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Inbox · Agent CRM" };

export default async function AgentInboxPage() {
  const ctx = await requireAgentContext();
  if (!ctx) redirect("/auth/sign-in?callbackUrl=/agent/inbox");

  const scope = leadScopeWhere(ctx, ctx.canSeeTeamLeads ? "team" : "mine");
  const leadIds = (
    await prisma.lead.findMany({
      where: scope,
      select: { id: true },
      take: 300,
    })
  ).map((l) => l.id);

  const emails = leadIds.length
    ? await prisma.leadEmailLog.findMany({
        where: { leadId: { in: leadIds } },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          lead: {
            select: {
              id: true,
              customer: { select: { name: true, email: true } },
            },
          },
          sentBy: { select: { name: true, email: true } },
        },
      })
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-ink">Inbox</h1>
        <p className="mt-2 text-sm text-ink/60">
          Outbound email log for your leads (inbound replies come in Phase 3.5).
        </p>
      </div>

      <ul className="divide-y divide-line/70 rounded-2xl border border-line/80 bg-surface/90">
        {emails.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-ink/45">
            No emails sent yet. Open a lead and use Email lead.
          </li>
        ) : (
          emails.map((e) => (
            <li key={e.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/agent/leads/${e.lead.id}`}
                  className="font-semibold text-ink hover:text-canopy"
                >
                  {e.subject}
                </Link>
                <time className="text-xs text-ink/40">
                  {e.createdAt.toLocaleString("en-CA")}
                </time>
              </div>
              <p className="mt-1 text-xs text-ink/50">
                To {e.toEmail} ·{" "}
                {e.lead.customer?.name || e.lead.customer?.email || "Lead"} ·
                from {e.sentBy.name || e.sentBy.email}
              </p>
              <p className="mt-1 line-clamp-2 text-sm text-ink/65">{e.body}</p>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
