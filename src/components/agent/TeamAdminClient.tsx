"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Member = {
  id: string;
  role: string;
  user: { id: string; name: string | null; email: string };
};

export function TeamAdminClient({
  canManage,
  seatLimit,
  memberCount,
  members,
  invites,
}: {
  canManage: boolean;
  seatLimit: number;
  memberCount: number;
  members: Member[];
  invites: Array<{ id: string; email: string; role: string; expiresAt: string }>;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("AGENT");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!canManage) {
    return (
      <p className="text-sm text-ink/55">
        Only team owners/admins can invite seats. You are an agent on this team.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-semibold text-ink">Seats</h2>
        <p className="mt-1 text-sm text-ink/55">
          {memberCount} / {seatLimit} used
        </p>
        <form
          className="mt-4 flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            setMsg(null);
            try {
              const res = await fetch("/api/agent/team", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, role }),
              });
              const json = (await res.json()) as { error?: string };
              if (!res.ok) {
                setMsg(json.error || "Invite failed");
              } else {
                setEmail("");
                setMsg("Invite sent.");
                router.refresh();
              }
            } finally {
              setPending(false);
            }
          }}
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="agent@brokerage.com"
            className="min-w-[220px] flex-1 rounded-lg border border-line px-3 py-2 text-sm"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-lg border border-line px-2 py-2 text-sm"
          >
            <option value="AGENT">Agent</option>
            <option value="ADMIN">Team admin</option>
            <option value="OWNER">Owner</option>
          </select>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-canopy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Invite
          </button>
        </form>
        {msg ? <p className="mt-2 text-xs text-ink/55">{msg}</p> : null}
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-semibold text-ink">Members</h2>
        <ul className="mt-3 divide-y divide-line/70">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 py-3 text-sm"
            >
              <div>
                <p className="font-medium text-ink">
                  {m.user.name || m.user.email}
                </p>
                <p className="text-xs text-ink/45">{m.user.email}</p>
              </div>
              <span className="rounded-md bg-mist px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink/60">
                {m.role}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {invites.length ? (
        <div className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-semibold text-ink">Pending invites</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {invites.map((i) => (
              <li key={i.id} className="flex justify-between gap-2 text-ink/70">
                <span>
                  {i.email} · {i.role}
                </span>
                <span className="text-xs text-ink/40">
                  expires {new Date(i.expiresAt).toLocaleDateString("en-CA")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function ReassignSelect({
  leadId,
  members,
  currentId,
  onUpdated,
}: {
  leadId: string;
  members: Array<{ user: { id: string; name: string | null; email: string } }>;
  currentId: string | null;
  onUpdated?: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <select
      disabled={pending}
      value={currentId ?? ""}
      onChange={async (e) => {
        setPending(true);
        try {
          await fetch("/api/agent/team", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "reassign",
              leadId,
              assigneeId: e.target.value || null,
            }),
          });
          router.refresh();
          onUpdated?.();
        } finally {
          setPending(false);
        }
      }}
      className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs"
    >
      <option value="">Pond (unassigned)</option>
      {members.map((m) => (
        <option key={m.user.id} value={m.user.id}>
          {m.user.name || m.user.email}
        </option>
      ))}
    </select>
  );
}
