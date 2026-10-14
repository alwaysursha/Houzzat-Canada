"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AgentProfessionalFields,
  type AgentProfessionalFormValue,
} from "@/components/agent/AgentProfessionalFields";
import { staffHardNavigate } from "@/components/site/StaffHardLink";
import { Button } from "@/components/ui/button";
import {
  STAFF_OVERLAY_PRIORITY,
  useStaffOverlay,
} from "@/lib/mobile/use-staff-overlay";

type Member = {
  id: string;
  role: string;
  status?: string;
  isPrimaryAgent?: boolean;
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
  name?: string | null;
};

export function TeamAdminClient({
  scope = "organization",
  workspaceName,
  canManage,
  seatLimit,
  consumedSeats,
  atCapacity,
  memberCount,
  members,
  invites,
  currentUserId,
  primaryAgentUserId,
  canSetPrimaryAgent = false,
}: {
  scope?: "organization" | "workspace";
  workspaceName?: string | null;
  canManage: boolean;
  seatLimit: number | null;
  consumedSeats?: number;
  atCapacity?: boolean;
  memberCount: number;
  members: Member[];
  invites: Invite[];
  currentUserId: string;
  primaryAgentUserId?: string | null;
  canSetPrimaryAgent?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("AGENT");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [recoLicenseNumber, setRecoLicenseNumber] = useState("");
  const [recoLicenseExpiresAt, setRecoLicenseExpiresAt] = useState("");
  const [pending, setPending] = useState(false);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const [memberActionId, setMemberActionId] = useState<string | null>(null);
  const [busyLaunchpadId, setBusyLaunchpadId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);
  const [transferToUserId, setTransferToUserId] = useState("");

  const transferOptions = useMemo(
    () =>
      members.filter(
        (m) =>
          m.user.id !== deleteTarget?.user.id &&
          m.user.agentActive !== false &&
          (m.status ? m.status === "ACTIVE" : true),
      ),
    [members, deleteTarget],
  );

  const isWorkspace = scope === "workspace";
  const usedSeats = consumedSeats ?? memberCount;
  const seatsFull =
    atCapacity === true ||
    (seatLimit != null && usedSeats >= seatLimit);
  const seatLabel =
    seatLimit == null
      ? `${usedSeats} ${usedSeats === 1 ? "seat" : "seats"} used`
      : `${usedSeats} of ${seatLimit} seats used`;

  async function accessMemberLaunchpad(member: Member) {
    if (!canManage || busyLaunchpadId) return;
    setBusyLaunchpadId(member.id);
    setMsg(null);
    try {
      const res = await fetch("/api/agent/desk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deskAgentId: member.user.id }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setMsg(json?.error || "Unable to open Launchpad for this agent.");
        return;
      }
      // Full navigation into Agent CRM with desk cookie set (no session swap).
      staffHardNavigate("/agent");
    } catch {
      setMsg("Unable to open Launchpad for this agent.");
    } finally {
      setBusyLaunchpadId(null);
    }
  }

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
      if (action === "disable_member")
        setMsg(isWorkspace ? "Member suspended." : "Agent seat disabled.");
      else if (action === "enable_member")
        setMsg(isWorkspace ? "Member reactivated." : "Agent seat re-enabled.");
      else {
        const t = json.transferred;
        setMsg(
          t
            ? `Member removed. Transferred ${t.leads ?? 0} leads, ${t.tasks ?? 0} tasks.`
            : "Member removed.",
        );
        setDeleteTarget(null);
        setTransferToUserId("");
      }
      router.refresh();
    } finally {
      setMemberActionId(null);
    }
  }

  const inviteProfile: AgentProfessionalFormValue = {
    firstName,
    lastName,
    email,
    phone,
    recoLicenseNumber,
    recoLicenseExpiresAt,
  };

  return (
    <div className="space-y-6">
      {canManage ? (
      <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="font-semibold text-ink">
          Invite Agent{workspaceName ? ` · ${workspaceName}` : ""}
        </h2>
        <p className="mt-1 text-sm text-ink/55">
          {seatLabel}.{" "}
          {seatsFull
            ? "You've used all seats included in your plan."
            : isWorkspace
              ? "You enter professional and contact information. The Agent only sets a password to activate. Invites email a secure link for this Workspace only."
              : "You enter professional and contact information. The Agent only sets a password to activate. Invites email a secure link for this team only."}
        </p>
        {seatsFull ? null : (
        <form
          className="mt-5 space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            setMsg(null);
            try {
              const res = await fetch("/api/agent/team", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                  isWorkspace
                    ? {
                        email,
                        role,
                        firstName,
                        lastName,
                        phone,
                        recoLicenseNumber,
                        recoLicenseExpiresAt,
                      }
                    : { email, role },
                ),
              });
              const json = (await res.json()) as {
                error?: string;
                scope?: string;
                convertsConsumerAccount?: boolean;
                alreadyMember?: boolean;
              };
              if (!res.ok) {
                setMsg(json.error || "Invite failed");
              } else {
                setEmail("");
                setFirstName("");
                setLastName("");
                setPhone("");
                setRecoLicenseNumber("");
                setRecoLicenseExpiresAt("");
                setMsg(
                  json.alreadyMember
                    ? "Added to Workspace — they were already a staff account."
                    : json.convertsConsumerAccount
                      ? "Invite sent — they already have a buyer/seller account and will be asked to switch to agent."
                      : isWorkspace && json.scope === "workspace"
                        ? "Workspace invite sent."
                        : "Invite sent.",
                );
                router.refresh();
              }
            } finally {
              setPending(false);
            }
          }}
        >
          {isWorkspace ? (
            <AgentProfessionalFields
              idPrefix="invite-agent"
              value={inviteProfile}
              onChange={(next) => {
                setFirstName(next.firstName);
                setLastName(next.lastName);
                setEmail(next.email);
                setPhone(next.phone);
                setRecoLicenseNumber(next.recoLicenseNumber);
                setRecoLicenseExpiresAt(next.recoLicenseExpiresAt);
              }}
            />
          ) : (
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="agent@brokerage.com"
              className="min-w-[220px] flex-1 rounded-lg border border-line px-3 py-2 text-sm"
            />
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1.5 text-sm font-medium text-ink">
              Seat role
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="block h-11 min-w-[160px] rounded-lg border border-line bg-surface px-3 text-sm"
              >
                <option value="AGENT">Agent</option>
                <option value="ADMIN">Team admin</option>
                {!isWorkspace ? <option value="OWNER">Owner</option> : null}
              </select>
            </label>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send invite"}
            </Button>
          </div>
        </form>
        )}
        {msg ? <p className="mt-3 text-xs text-ink/55">{msg}</p> : null}
      </div>
      ) : (
        <p className="text-sm text-ink/55">
          You can view Agent profiles. Only workspace owners/admins can invite
          seats or edit professional and contact information.
        </p>
      )}

      <div className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-semibold text-ink">Members</h2>
        <ul className="mt-3 divide-y divide-line/70">
          {members.map((m) => {
            const busy = memberActionId === m.id;
            const isSelf = m.user.id === currentUserId;
            const disabled = !m.user.agentActive;
            const isPrimary =
              m.isPrimaryAgent || m.user.id === primaryAgentUserId;
            return (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {m.user.name || m.user.email}
                    {isPrimary ? (
                      <span className="ml-2 rounded bg-[#ecfdf5] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0f766e]">
                        Primary Agent
                      </span>
                    ) : null}
                    {disabled ? (
                      <span className="ml-2 rounded bg-[#fee2e2] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#b91c1c]">
                        {isWorkspace ? "Suspended" : "Disabled"}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-ink/45">{m.user.email}</p>
                </div>
                <div className="flex max-w-full flex-wrap items-center gap-2">
                  {isWorkspace ? (
                    <Link
                      href={`/agent/team/${m.user.id}`}
                      className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] font-semibold text-canopy hover:bg-mist"
                    >
                      {canManage ? "Edit profile" : "View profile"}
                    </Link>
                  ) : null}
                  {canManage &&
                  isWorkspace &&
                  m.role === "AGENT" &&
                  m.user.agentActive &&
                  (m.status ? m.status === "ACTIVE" : true) ? (
                    <button
                      type="button"
                      disabled={busyLaunchpadId === m.id}
                      onClick={() => void accessMemberLaunchpad(m)}
                      className="rounded-lg border border-canopy/30 bg-canopy/5 px-2.5 py-1.5 text-[12px] font-semibold text-canopy hover:bg-canopy/10 disabled:opacity-50"
                    >
                      {busyLaunchpadId === m.id
                        ? "Opening…"
                        : "Access Launchpad"}
                    </button>
                  ) : null}
                  <span className="rounded-md bg-mist px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink/60">
                    {m.role}
                  </span>
                  {canManage && !isSelf ? (
                    <>
                      {isWorkspace &&
                      canSetPrimaryAgent &&
                      !isPrimary &&
                      !disabled ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Set ${m.user.name || m.user.email} as Primary Agent for this Workspace?`,
                              )
                            ) {
                              return;
                            }
                            void (async () => {
                              setMemberActionId(m.id);
                              setMsg(null);
                              try {
                                const res = await fetch("/api/agent/team", {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    action: "set_primary_agent",
                                    userId: m.user.id,
                                  }),
                                });
                                const json = (await res.json()) as {
                                  error?: string;
                                };
                                if (!res.ok) {
                                  setMsg(json.error || "Action failed");
                                  return;
                                }
                                setMsg("Primary Agent updated.");
                                router.refresh();
                              } finally {
                                setMemberActionId(null);
                              }
                            })();
                          }}
                          className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#0f766e] hover:bg-[#ecfdf5] disabled:opacity-50"
                        >
                          Make primary
                        </button>
                      ) : null}
                      {isWorkspace &&
                      m.role === "AGENT" &&
                      !disabled ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Promote ${m.user.name || m.user.email} to ADMIN?`,
                              )
                            ) {
                              return;
                            }
                            void (async () => {
                              setMemberActionId(m.id);
                              setMsg(null);
                              try {
                                const res = await fetch("/api/agent/team", {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    action: "change_role",
                                    membershipId: m.id,
                                    role: "ADMIN",
                                  }),
                                });
                                const json = (await res.json()) as {
                                  error?: string;
                                };
                                if (!res.ok) {
                                  setMsg(json.error || "Action failed");
                                  return;
                                }
                                setMsg("Role updated.");
                                router.refresh();
                              } finally {
                                setMemberActionId(null);
                              }
                            })();
                          }}
                          className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] font-semibold text-ink/70 hover:bg-mist disabled:opacity-50"
                        >
                          Make admin
                        </button>
                      ) : null}
                      {disabled ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void runMemberAction(m.id, "enable_member")
                          }
                          className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#0f766e] hover:bg-[#ecfdf5] disabled:opacity-50"
                        >
                          {busy ? "…" : isWorkspace ? "Reactivate" : "Enable"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (
                              !window.confirm(
                                isWorkspace
                                  ? `Suspend ${m.user.name || m.user.email} in this Workspace?`
                                  : `Disable CRM access for ${m.user.name || m.user.email}?`,
                              )
                            ) {
                              return;
                            }
                            void runMemberAction(m.id, "disable_member");
                          }}
                          className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#b45309] hover:bg-[#fffbeb] disabled:opacity-50"
                        >
                          {busy ? "…" : isWorkspace ? "Suspend" : "Disable"}
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
                        Remove
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {canManage && invites.length ? (
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
                      {i.name ? `${i.name} · ` : ""}
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
              Remove {isWorkspace ? "Workspace member" : "agent seat"}
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-[#475569]">
              Remove{" "}
              <strong className="text-[#0f172a]">
                {deleteTarget.user.name || deleteTarget.user.email}
              </strong>{" "}
              from this {isWorkspace ? "Workspace" : "team"}.
              {isWorkspace
                ? " Their other Workspace memberships (if any) stay intact. Choose who should receive their leads and tasks in this Workspace."
                : " Their agent profile will be deactivated and their buyer profile restored. Choose who should receive their leads, tasks, and appointments."}
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
                  ? "Removing…"
                  : "Transfer & remove"}
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
