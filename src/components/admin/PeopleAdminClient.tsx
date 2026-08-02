"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { cn } from "@/lib/utils";

type PersonRow = {
  id: string;
  name: string | null;
  email: string;
  role: "BUYER" | "SELLER" | "AGENT" | "ADMIN";
  isBuyer: boolean;
  isSeller: boolean;
  disabledAt: string | null;
  createdAt: string;
  leadCount: number;
  lastSeenAt: string | null;
  assignedAgentId: string | null;
  assignedAgentLabel: string | null;
};

type AgentOption = {
  id: string;
  name: string | null;
  email: string;
};

export function PeopleAdminClient({
  people,
  agents,
}: {
  people: PersonRow[];
  agents: AgentOption[];
}) {
  const router = useRouter();
  const { toast } = useSiteAlert();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const filtered = people.filter((p) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return (
      p.email.toLowerCase().includes(needle) ||
      (p.name?.toLowerCase().includes(needle) ?? false) ||
      p.role.toLowerCase().includes(needle) ||
      (p.assignedAgentLabel?.toLowerCase().includes(needle) ?? false)
    );
  });

  async function patchUser(
    id: string,
    body: Record<string, unknown>,
    okMessage: string,
  ) {
    setPendingId(id);
    const res = await fetch(`/api/admin/people/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setPendingId(null);
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      toast({
        message: data?.error ?? "Couldn’t update user",
        tone: "error",
      });
      return;
    }
    toast({ message: okMessage, tone: "success" });
    router.refresh();
  }

  async function assignAgent(customerId: string, assigneeId: string | null) {
    setPendingId(customerId);
    const res = await fetch(
      `/api/admin/people/${encodeURIComponent(customerId)}/assign-agent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId }),
      },
    );
    setPendingId(null);
    const data = (await res.json().catch(() => null)) as {
      error?: string;
      updated?: number;
    } | null;
    if (!res.ok) {
      toast({
        message: data?.error ?? "Couldn’t assign agent",
        tone: "error",
      });
      return;
    }
    toast({
      message: assigneeId
        ? `Assigned to agent${data?.updated ? ` (${data.updated} lead${data.updated === 1 ? "" : "s"})` : ""}`
        : "Moved to pond",
      tone: "success",
    });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name, email, role, agent…"
        className="w-full max-w-md rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-canopy/50"
      />

      <div className="overflow-hidden rounded-2xl border border-line/80 bg-surface">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="border-b border-line/70 bg-mist/50 text-[11px] uppercase tracking-wide text-ink/45">
            <tr>
              <th className="px-4 py-3 font-semibold">Person</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Flags</th>
              <th className="px-4 py-3 font-semibold">Leads</th>
              <th className="px-4 py-3 font-semibold">Assigned agent</th>
              <th className="px-4 py-3 font-semibold">Last seen</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {filtered.map((person) => {
              // Buyers/sellers can always be assigned (creates a CRM lead if needed).
              // Staff rows only show assign when they already have customer leads.
              const canAssignLeads =
                person.role === "BUYER" ||
                person.role === "SELLER" ||
                person.leadCount > 0;

              return (
                <tr key={person.id} className="align-top">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/people/${person.id}`}
                      className="font-semibold text-ink hover:text-canopy"
                    >
                      {person.name || "—"}
                    </Link>
                    <p className="text-xs text-ink/50">{person.email}</p>
                    {person.disabledAt ? (
                      <p className="mt-1 text-[11px] font-semibold text-danger">
                        Suspended
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="rounded-lg border border-line bg-mist/40 px-2 py-1.5 text-xs font-semibold"
                      disabled={pendingId === person.id}
                      value={person.role}
                      onChange={(e) =>
                        void patchUser(
                          person.id,
                          { role: e.target.value },
                          `Role → ${e.target.value}`,
                        )
                      }
                    >
                      <option value="BUYER">BUYER</option>
                      <option value="SELLER">SELLER</option>
                      <option value="AGENT">AGENT</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink/60">
                    <p>{person.isBuyer ? "Buyer tools" : "—"}</p>
                    <p>{person.isSeller ? "Seller tools" : "—"}</p>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{person.leadCount}</td>
                  <td className="px-4 py-3">
                    {canAssignLeads ? (
                      <select
                        className="max-w-[180px] rounded-lg border border-line bg-white px-2 py-1.5 text-xs font-semibold text-ink"
                        disabled={pendingId === person.id || !agents.length}
                        value={person.assignedAgentId ?? ""}
                        onChange={(e) =>
                          void assignAgent(
                            person.id,
                            e.target.value || null,
                          )
                        }
                        aria-label={`Assign agent for ${person.email}`}
                      >
                        <option value="">Pond (unassigned)</option>
                        {agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name || agent.email}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-ink/45">
                        {person.assignedAgentLabel || "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink/50">
                    {person.lastSeenAt
                      ? new Date(person.lastSeenAt).toLocaleString("en-CA", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1.5">
                      <Link
                        href={`/admin/people/${person.id}`}
                        className="text-xs font-semibold text-canopy hover:underline"
                      >
                        Journey →
                      </Link>
                      {canAssignLeads ? (
                        <Link
                          href="/agent/leads?view=team"
                          className="text-xs font-semibold text-ink/55 hover:text-canopy hover:underline"
                        >
                          Open CRM desk →
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        disabled={pendingId === person.id}
                        onClick={() =>
                          void patchUser(
                            person.id,
                            { disabled: !person.disabledAt },
                            person.disabledAt
                              ? "User restored"
                              : "User suspended",
                          )
                        }
                        className={cn(
                          "text-left text-xs font-semibold",
                          person.disabledAt
                            ? "text-canopy"
                            : "text-danger hover:underline",
                        )}
                      >
                        {person.disabledAt ? "Restore" : "Suspend"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink/50">
            No people match that search.
          </p>
        ) : null}
      </div>
    </div>
  );
}
