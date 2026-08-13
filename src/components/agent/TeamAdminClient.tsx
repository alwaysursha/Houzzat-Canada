"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  STAFF_OVERLAY_PRIORITY,
  useStaffOverlay,
} from "@/lib/mobile/use-staff-overlay";

type Member = {
  id: string;
  role: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    agentActive: boolean;
  };
};

type Invite = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
};

export function TeamAdminClient({
  canManage,
  seatLimit,
  memberCount,
  members,
  invites,
  currentUserId,
}: {
  canManage: boolean;
  seatLimit: number;
  memberCount: number;
  members: Member[];
  invites: Invite[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("AGENT");
  const [pending, setPending] = useState(false);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const [memberActionId, setMemberActionId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);
  const [transferToUserId, setTransferToUserId] = useState("");

  const transferOptions = useMemo(
    () =>
      members.filter(
        (m) =>
          m.user.id !== deleteTarget?.user.id &&
          m.user.agentActive !== false,
      ),
    [members, deleteTarget],
  );

  useStaffOverlay({
    open: Boolean(deleteTarget),
    id: "team-delete-seat",
    priority: STAFF_OVERLAY_PRIORITY.sheet,
    onClose: () => setDeleteTarget(null),
  });

  async function runInviteAction(
    inviteId: string,
    action: "resend_invite" | "cancel_invite",
  ) {
    setInviteActionId(inviteId);
    setMsg(null);
    try {
      const res = await fetch("/api/agent/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, inviteId }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg(json.error || "Action failed");
        return;
      }
      setMsg(action === "resend_invite" ? "Invite resent." : "Invite cancelled.");
      router.refresh();
    } finally {
      setInviteActionId(null);
    }
  }

  async function runMemberAction(
    membershipId: string,
    action: "disable_member" | "enable_member" | "delete_member",
    transferId?: string,
  ) {
    setMemberActionId(membershipId);
    setMsg(null);
    try {
      const res = await fetch("/api/agent/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          membershipId,
          transferToUserId: transferId,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        transferred?: Record<string, number>;
      };
      if (!res.ok) {
        setMsg(json.error || "Action failed");
        return;
      }
      if (action === "disable_member") setMsg("Agent seat disabled.");
      else if (action === "enable_member") setMsg("Agent seat re-enabled.");
      else {
        const t = json.transferred;
        setMsg(
          t
            ? `Agent removed. Transferred ${t.leads ?? 0} leads, ${t.tasks ?? 0} tasks.`
            : "Agent removed.",
        );
        setDeleteTarget(null);
        setTransferToUserId("");
      }
      router.refresh();
    } finally {
      setMemberActionId(null);
    }
  }

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
          {memberCount} / {seatLimit} used. Invites email a secure link so the
          agent can create an account or sign in and join the team. Existing
          buyer/seller accounts are warned that those profiles will be disabled.
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
              const json = (await res.json()) as {
                error?: string;
                convertsConsumerAccount?: boolean;
              };
              if (!res.ok) {
                setMsg(json.error || "Invite failed");
              } else {
                setEmail("");
                setMsg(
                  json.convertsConsumerAccount
                    ? "Invite sent — they already have a buyer/seller account and will be asked to switch to agent."
                    : "Invite sent.",
                );
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
          {members.map((m) => {
            const busy = memberActionId === m.id;
            const isSelf = m.user.id === currentUserId;
            const disabled = !m.user.agentActive;
            return (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {m.user.name || m.user.email}
                    {disabled ? (
                      <span className="ml-2 rounded bg-[#fee2e2] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#b91c1c]">
                        Disabled
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-ink/45">{m.user.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-mist px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink/60">
                    {m.role}
                  </span>
                  {!isSelf ? (
                    <>
                      {disabled ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void runMemberAction(m.id, "enable_member")
                          }
                          className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#0f766e] hover:bg-[#ecfdf5] disabled:opacity-50"
                        >
                          {busy ? "…" : "Enable"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Disable CRM access for ${m.user.name || m.user.email}?`,
                              )
                            ) {
                              return;
                            }
                            void runMemberAction(m.id, "disable_member");
                          }}
                          className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#b45309] hover:bg-[#fffbeb] disabled:opacity-50"
                        >
                          {busy ? "…" : "Disable"}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setDeleteTarget(m);
                          setTransferToUserId(
                            members.find(
                              (x) =>
                                x.user.id !== m.user.id && x.user.agentActive,
                            )?.user.id ?? "",
                          );
                        }}
                        className="rounded-lg border border-[#fecdd3] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#be123c] hover:bg-[#fff1f2] disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {invites.length ? (
        <div className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-semibold text-ink">Pending invites</h2>
          <ul className="mt-3 divide-y divide-line/70">
            {invites.map((i) => {
              const busy = inviteActionId === i.id;
              return (
                <li
                  key={i.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {i.email}{" "}
                      <span className="font-normal text-ink/50">· {i.role}</span>
                    </p>
                    <p className="text-xs text-ink/40">
                      expires{" "}
                      {new Date(i.expiresAt).toLocaleDateString("en-CA")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={busy || pending}
                      onClick={() => void runInviteAction(i.id, "resend_invite")}
                      className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#2b6cb0] hover:bg-[#eff6ff] disabled:opacity-50"
                    >
                      {busy ? "Working…" : "Resend"}
                    </button>
                    <button
                      type="button"
                      disabled={busy || pending}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Cancel invite to ${i.email}? They won’t be able to use the old link.`,
                          )
                        ) {
                          return;
                        }
                        void runInviteAction(i.id, "cancel_invite");
                      }}
                      className="rounded-lg border border-[#fecdd3] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#be123c] hover:bg-[#fff1f2] disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-[#1e2a38]/45"
            aria-label="Close"
            onClick={() => setDeleteTarget(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-[#d8dee6] bg-white p-5 shadow-xl">
            <h3 className="text-[16px] font-bold text-[#1e2a38]">
              Delete agent seat
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-[#475569]">
              Remove{" "}
              <strong className="text-[#0f172a]">
                {deleteTarget.user.name || deleteTarget.user.email}
              </strong>{" "}
              from the team. Their agent profile will be deactivated and their
              buyer profile restored. Choose who should receive their leads,
              tasks, and appointments.
            </p>
            <label className="mt-4 block text-[12px] font-semibold text-[#334155]">
              Transfer data to
              <select
                value={transferToUserId}
                onChange={(e) => setTransferToUserId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#d8dee6] px-3 py-2 text-sm"
              >
                <option value="">Select teammate…</option>
                {transferOptions.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.name || m.user.email} ({m.role})
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#64748b]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  !transferToUserId || memberActionId === deleteTarget.id
                }
                onClick={() =>
                  void runMemberAction(
                    deleteTarget.id,
                    "delete_member",
                    transferToUserId,
                  )
                }
                className="rounded-lg bg-[#be123c] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {memberActionId === deleteTarget.id
                  ? "Deleting…"
                  : "Transfer & delete"}
              </button>
            </div>
          </div>
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
