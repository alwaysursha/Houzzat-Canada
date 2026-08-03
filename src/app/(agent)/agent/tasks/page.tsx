import Link from "next/link";
import { redirect } from "next/navigation";
import { TaskCompleteButton, TaskForm } from "@/components/agent/TaskForm";
import { requireAgentContext } from "@/lib/agent";
import { resolveDeskView } from "@/lib/agent/brokerage";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Tasks · Agent CRM" };

export default async function AgentTasksPage() {
  const ctx = await requireAgentContext();
  if (!ctx) redirect("/auth/sign-in?callbackUrl=/agent/tasks");

  const desk = await resolveDeskView(ctx);
  const focusAgentId = desk.deskAgentId;
  const assigneeFilter = focusAgentId
    ? { assigneeId: focusAgentId }
    : ctx.canSeeTeamLeads
      ? {}
      : { assigneeId: ctx.user.id };

  const now = new Date();
  const tasks = await prisma.agentTask.findMany({
    where: {
      organizationId: ctx.organizationId,
      status: "OPEN",
      ...assigneeFilter,
    },
    orderBy: { dueAt: "asc" },
    take: 100,
    include: {
      lead: {
        select: {
          id: true,
          source: true,
          customer: { select: { name: true, email: true } },
        },
      },
    },
  });

  const overdue = tasks.filter((t) => t.dueAt < now);
  const upcoming = tasks.filter((t) => t.dueAt >= now);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-ink sm:text-4xl">Tasks & reminders</h1>
        <p className="mt-2 text-sm text-ink/60">
          Call, email, and to-dos across your book.
        </p>
      </div>

      <TaskForm />

      {[
        { title: "Overdue", items: overdue },
        { title: "Upcoming", items: upcoming },
      ].map((group) => (
        <section key={group.title} className="space-y-3">
          <h2 className="font-display text-xl text-ink">
            {group.title} · {group.items.length}
          </h2>
          <ul className="divide-y divide-line/70 rounded-2xl border border-line/80 bg-surface/90">
            {group.items.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-ink/45">
                None
              </li>
            ) : (
              group.items.map((task) => (
                <li
                  key={task.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">{task.title}</p>
                    <p className="text-xs text-ink/45">
                      {task.type} ·{" "}
                      {task.dueAt.toLocaleString("en-CA", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {task.lead ? (
                        <>
                          {" · "}
                          <Link
                            href={`/agent/leads?lead=${task.lead.id}`}
                            className="text-canopy"
                          >
                            {task.lead.customer?.name ||
                              task.lead.customer?.email ||
                              "Lead"}
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <TaskCompleteButton taskId={task.id} />
                </li>
              ))
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
