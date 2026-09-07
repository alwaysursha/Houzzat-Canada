"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  TEAM_ABOUT_TEXT_MAX,
  TEAM_MEMBER_BIO_MAX,
  TEAM_MEMBER_CELL_MAX,
  TEAM_MEMBER_DESIGNATION_MAX,
  TEAM_MEMBER_EMAIL_MAX,
  TEAM_MEMBER_NAME_MAX,
  TEAM_SERVICE_AREA_MAX_COUNT,
  TEAM_SERVICE_AREA_MAX_LENGTH,
} from "@/lib/tenancy/team-roster/limits";

type TeamProfile = {
  workspaceId: string;
  aboutText: string | null;
  serviceAreas: string[];
  leaderMemberId: string | null;
  updatedAt: string;
};

type TeamMember = {
  id: string;
  workspaceId: string;
  name: string | null;
  designation: string | null;
  photoUrl: string | null;
  cellPhone: string | null;
  email: string | null;
  bio: string | null;
  sortOrder: number;
  isVisible: boolean;
  isLeader: boolean;
  createdAt: string;
  updatedAt: string;
};

type MemberForm = {
  name: string;
  designation: string;
  cellPhone: string;
  email: string;
  bio: string;
};

const EMPTY_FORM: MemberForm = {
  name: "",
  designation: "",
  cellPhone: "",
  email: "",
  bio: "",
};

type ApiEnvelope<T> = {
  ok: boolean;
  message?: string;
  code?: string;
  data?: T;
};

type TeamRosterSectionProps = {
  workspaceId: string;
  /** Server-authoritative Team Signature data readiness (E.8). */
  teamSignatureDataReadiness?: {
    ready: boolean;
    missingLabels: string[];
  } | null;
  /** Refresh parent onboarding payload after roster mutations. */
  onRosterChange?: () => void;
};

function memberToForm(m: TeamMember): MemberForm {
  return {
    name: m.name ?? "",
    designation: m.designation ?? "",
    cellPhone: m.cellPhone ?? "",
    email: m.email ?? "",
    bio: m.bio ?? "",
  };
}

function areasToText(areas: string[]): string {
  return areas.join("\n");
}

function textToAreas(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Stage 6.11E.6 / E.8 — OWNER Team Profile + WorkspaceTeamMember roster editor.
 * Uses E.4 roster APIs + E.5 photo endpoints. Readiness is server-authoritative.
 */
export function TeamRosterSection({
  workspaceId,
  teamSignatureDataReadiness,
  onRosterChange,
}: TeamRosterSectionProps) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<TeamProfile | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [aboutText, setAboutText] = useState("");
  const [serviceAreasText, setServiceAreasText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<MemberForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<MemberForm>(EMPTY_FORM);
  const photoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const clearFlash = () => {
    setError(null);
    setMessage(null);
  };

  const notifyParent = () => {
    onRosterChange?.();
  };

  const applyList = useCallback((nextProfile: TeamProfile, nextMembers: TeamMember[]) => {
    setProfile(nextProfile);
    setMembers(nextMembers);
    setAboutText(nextProfile.aboutText ?? "");
    setServiceAreasText(areasToText(nextProfile.serviceAreas ?? []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    clearFlash();
    try {
      const res = await fetch(
        `/api/onboarding/team-members?workspaceId=${encodeURIComponent(workspaceId)}`,
      );
      const json = (await res.json()) as ApiEnvelope<{
        profile: TeamProfile;
        members: TeamMember[];
      }>;
      if (!res.ok || !json.ok || !json.data) {
        setError(json.message ?? "Unable to load Team roster.");
        return;
      }
      applyList(json.data.profile, json.data.members);
    } catch {
      setError("Network error while loading Team roster.");
    } finally {
      setLoading(false);
    }
  }, [applyList, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    clearFlash();
    try {
      const areas = textToAreas(serviceAreasText);
      if (areas.length > TEAM_SERVICE_AREA_MAX_COUNT) {
        setError(`At most ${TEAM_SERVICE_AREA_MAX_COUNT} service areas.`);
        return;
      }
      if (areas.some((a) => a.length > TEAM_SERVICE_AREA_MAX_LENGTH)) {
        setError(
          `Each service area must be at most ${TEAM_SERVICE_AREA_MAX_LENGTH} characters.`,
        );
        return;
      }
      const res = await fetch("/api/onboarding/team-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          aboutText: aboutText.trim() || null,
          serviceAreas: areas,
        }),
      });
      const json = (await res.json()) as ApiEnvelope<{ profile: TeamProfile }>;
      if (!res.ok || !json.ok || !json.data?.profile) {
        setError(json.message ?? "Unable to save Team profile.");
        return;
      }
      setProfile(json.data.profile);
      setAboutText(json.data.profile.aboutText ?? "");
      setServiceAreasText(areasToText(json.data.profile.serviceAreas ?? []));
      setMessage("Team profile saved.");
    } catch {
      setError("Network error while saving Team profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function createMember(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    clearFlash();
    try {
      const res = await fetch("/api/onboarding/team-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          workspaceId,
          name: addForm.name.trim() || null,
          designation: addForm.designation.trim() || null,
          cellPhone: addForm.cellPhone.trim() || null,
          email: addForm.email.trim() || null,
          bio: addForm.bio.trim() || null,
        }),
      });
      const json = (await res.json()) as ApiEnvelope<{ member: TeamMember }>;
      if (!res.ok || !json.ok || !json.data?.member) {
        setError(json.message ?? "Unable to add Team member.");
        return;
      }
      setMembers((prev) => [...prev, json.data!.member]);
      setAddForm(EMPTY_FORM);
      setShowAdd(false);
      setEditingId(json.data.member.id);
      setEditForm(memberToForm(json.data.member));
      setMessage("Team member added. Upload a photo before publishing.");
      notifyParent();
    } catch {
      setError("Network error while adding Team member.");
    } finally {
      setCreating(false);
    }
  }

  async function saveMember(memberId: string) {
    setBusyMemberId(memberId);
    clearFlash();
    try {
      const res = await fetch(`/api/onboarding/team-members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name: editForm.name.trim() || null,
          designation: editForm.designation.trim() || null,
          cellPhone: editForm.cellPhone.trim() || null,
          email: editForm.email.trim() || null,
          bio: editForm.bio.trim() || null,
        }),
      });
      const json = (await res.json()) as ApiEnvelope<{ member: TeamMember }>;
      if (!res.ok || !json.ok || !json.data?.member) {
        setError(json.message ?? "Unable to update Team member.");
        return;
      }
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? json.data!.member : m)),
      );
      setMessage("Team member saved.");
      notifyParent();
    } catch {
      setError("Network error while updating Team member.");
    } finally {
      setBusyMemberId(null);
    }
  }

  async function setVisibility(memberId: string, isVisible: boolean) {
    setBusyMemberId(memberId);
    clearFlash();
    try {
      const res = await fetch(`/api/onboarding/team-members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, isVisible }),
      });
      const json = (await res.json()) as ApiEnvelope<{ member: TeamMember }>;
      if (!res.ok || !json.ok || !json.data?.member) {
        setError(
          json.message ??
            (isVisible
              ? "Unable to publish. Name, designation, and photo are required."
              : "Unable to unpublish Team member."),
        );
        return;
      }
      await load();
      setMessage(isVisible ? "Team member published." : "Team member unpublished.");
      notifyParent();
    } catch {
      setError("Network error while updating visibility.");
    } finally {
      setBusyMemberId(null);
    }
  }

  async function uploadPhoto(memberId: string, file: File) {
    if (file.size > 5 * 1024 * 1024) {
      setError("Photo too large (max 5MB).");
      return;
    }
    setBusyMemberId(memberId);
    clearFlash();
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("workspaceId", workspaceId);
      const res = await fetch(
        `/api/onboarding/team-members/${memberId}/photo`,
        { method: "POST", body },
      );
      const json = (await res.json()) as ApiEnvelope<{ member: TeamMember }>;
      if (!res.ok || !json.ok || !json.data?.member) {
        setError(json.message ?? "Photo upload failed.");
        return;
      }
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? json.data!.member : m)),
      );
      setMessage("Photo saved.");
      notifyParent();
    } catch {
      setError("Network error while uploading photo.");
    } finally {
      setBusyMemberId(null);
    }
  }

  async function removePhoto(memberId: string) {
    setBusyMemberId(memberId);
    clearFlash();
    try {
      const res = await fetch(
        `/api/onboarding/team-members/${memberId}/photo`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId }),
        },
      );
      const json = (await res.json()) as ApiEnvelope<{ member: TeamMember }>;
      if (!res.ok || !json.ok || !json.data?.member) {
        setError(json.message ?? "Unable to remove photo.");
        return;
      }
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? json.data!.member : m)),
      );
      setMessage("Photo removed.");
      notifyParent();
    } catch {
      setError("Network error while removing photo.");
    } finally {
      setBusyMemberId(null);
    }
  }

  async function deleteMember(memberId: string) {
    if (
      !window.confirm(
        "Remove this Team member from the public roster? This cannot be undone.",
      )
    ) {
      return;
    }
    setBusyMemberId(memberId);
    clearFlash();
    try {
      const res = await fetch(`/api/onboarding/team-members/${memberId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const json = (await res.json()) as ApiEnvelope<{ deleted: boolean }>;
      if (!res.ok || !json.ok) {
        setError(json.message ?? "Unable to remove Team member.");
        return;
      }
      if (editingId === memberId) setEditingId(null);
      await load();
      setMessage("Team member removed.");
      notifyParent();
    } catch {
      setError("Network error while removing Team member.");
    } finally {
      setBusyMemberId(null);
    }
  }

  async function moveMember(memberId: string, direction: "up" | "down") {
    const index = members.findIndex((m) => m.id === memberId);
    if (index < 0) return;
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= members.length) return;

    const orderedIds = members.map((m) => m.id);
    const tmp = orderedIds[index]!;
    orderedIds[index] = orderedIds[swapWith]!;
    orderedIds[swapWith] = tmp;

    setBusyMemberId(memberId);
    clearFlash();
    try {
      const res = await fetch("/api/onboarding/team-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reorder",
          workspaceId,
          orderedIds,
        }),
      });
      const json = (await res.json()) as ApiEnvelope<{
        profile: TeamProfile;
        members: TeamMember[];
      }>;
      if (!res.ok || !json.ok || !json.data) {
        setError(json.message ?? "Unable to reorder Team members.");
        return;
      }
      applyList(json.data.profile, json.data.members);
      setMessage("Roster order updated.");
    } catch {
      setError("Network error while reordering.");
    } finally {
      setBusyMemberId(null);
    }
  }

  async function setLeader(memberId: string | null) {
    setBusyMemberId(memberId ?? "leader");
    clearFlash();
    try {
      const res = await fetch("/api/onboarding/team-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          memberId
            ? { action: "set_leader", memberId, workspaceId }
            : { action: "clear_leader", workspaceId },
        ),
      });
      const json = (await res.json()) as ApiEnvelope<{
        profile: TeamProfile;
        leader?: TeamMember;
      }>;
      if (!res.ok || !json.ok) {
        setError(json.message ?? "Unable to update team leader.");
        return;
      }
      await load();
      setMessage(memberId ? "Team leader updated." : "Team leader cleared.");
      notifyParent();
    } catch {
      setError("Network error while updating team leader.");
    } finally {
      setBusyMemberId(null);
    }
  }

  function renderMemberFields(
    form: MemberForm,
    setForm: (next: MemberForm) => void,
    disabled: boolean,
  ) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-slate-700 sm:col-span-1">
          Name
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            maxLength={TEAM_MEMBER_NAME_MAX}
            disabled={disabled}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label className="block text-sm text-slate-700">
          Designation / title
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            maxLength={TEAM_MEMBER_DESIGNATION_MAX}
            disabled={disabled}
            value={form.designation}
            onChange={(e) => setForm({ ...form, designation: e.target.value })}
          />
        </label>
        <label className="block text-sm text-slate-700">
          Cell phone
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            maxLength={TEAM_MEMBER_CELL_MAX}
            disabled={disabled}
            value={form.cellPhone}
            onChange={(e) => setForm({ ...form, cellPhone: e.target.value })}
          />
        </label>
        <label className="block text-sm text-slate-700">
          Email
          <input
            type="email"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            maxLength={TEAM_MEMBER_EMAIL_MAX}
            disabled={disabled}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label className="block text-sm text-slate-700 sm:col-span-2">
          Bio
          <textarea
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            rows={3}
            maxLength={TEAM_MEMBER_BIO_MAX}
            disabled={disabled}
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
          />
        </label>
      </div>
    );
  }

  return (
    <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6">
      <div>
        <h2 className="text-lg font-medium text-slate-900">Team roster</h2>
        <p className="mt-1 text-sm text-slate-600">
          Manage your public presentation team. This is separate from HouzzatPRO
          user access — roster members do not need logins or MLS connections.
        </p>
        {teamSignatureDataReadiness ? (
          <p className="mt-2 text-xs text-slate-500">
            Team Signature data readiness:{" "}
            <span className="font-medium text-slate-700">
              {teamSignatureDataReadiness.ready ? "READY" : "NOT READY"}
            </span>
            {!teamSignatureDataReadiness.ready ? (
              <span className="text-amber-700">
                {" "}
                — complete the items below before Team Signature can be
                considered data-ready (catalog enable is separate).
              </span>
            ) : (
              <span className="text-emerald-700">
                {" "}
                — workspace data meets Team Signature requirements.
              </span>
            )}
          </p>
        ) : null}
        {teamSignatureDataReadiness &&
        !teamSignatureDataReadiness.ready &&
        teamSignatureDataReadiness.missingLabels.length > 0 ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p className="font-semibold">Still needed:</p>
            <ul className="mt-1 list-disc pl-4">
              {teamSignatureDataReadiness.missingLabels.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading Team roster…</p>
      ) : (
        <>
          <form onSubmit={saveProfile} className="space-y-3 border-t border-slate-100 pt-5">
            <h3 className="text-sm font-medium text-slate-800">Team profile</h3>
            <label className="block text-sm text-slate-700">
              About the team
              <textarea
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                rows={4}
                maxLength={TEAM_ABOUT_TEXT_MAX}
                value={aboutText}
                onChange={(e) => setAboutText(e.target.value)}
              />
            </label>
            <label className="block text-sm text-slate-700">
              Service areas
              <span className="ml-2 text-xs font-normal text-slate-400">
                one per line
              </span>
              <textarea
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                rows={3}
                value={serviceAreasText}
                onChange={(e) => setServiceAreasText(e.target.value)}
                placeholder={"Toronto\nMississauga"}
              />
            </label>
            <button
              type="submit"
              disabled={savingProfile}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--canopy, #0F6B4C)" }}
            >
              {savingProfile ? "Saving…" : "Save team profile"}
            </button>
            {profile?.leaderMemberId ? (
              <p className="text-xs text-slate-500">
                Current leader member id: {profile.leaderMemberId}
              </p>
            ) : null}
          </form>

          <div className="space-y-4 border-t border-slate-100 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-slate-800">
                Members ({members.length})
              </h3>
              <button
                type="button"
                disabled={creating}
                onClick={() => {
                  setShowAdd((v) => !v);
                  setAddForm(EMPTY_FORM);
                  clearFlash();
                }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-800"
              >
                {showAdd ? "Cancel" : "Add member"}
              </button>
            </div>

            {showAdd ? (
              <form
                onSubmit={createMember}
                className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
              >
                <p className="text-xs text-slate-500">
                  Save the member first, then upload a photo. Photos cannot be
                  set by URL.
                </p>
                {renderMemberFields(addForm, setAddForm, creating)}
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  style={{ backgroundColor: "var(--canopy, #0F6B4C)" }}
                >
                  {creating ? "Adding…" : "Add member"}
                </button>
              </form>
            ) : null}

            {members.length === 0 && !showAdd ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                No Team members yet. Add your first public roster member.
              </p>
            ) : null}

            <ul className="space-y-4">
              {members.map((member, index) => {
                const busy = busyMemberId === member.id;
                const editing = editingId === member.id;
                return (
                  <li
                    key={member.id}
                    className="rounded-lg border border-slate-200 p-4"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      <div className="relative aspect-[3/4] w-full max-w-[7rem] overflow-hidden bg-slate-100 sm:w-28">
                        {member.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={member.photoUrl}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover object-top"
                          />
                        ) : (
                          <span className="flex h-full items-center justify-center px-2 text-center text-[11px] text-slate-400">
                            No photo
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              {member.name?.trim() || "Untitled member"}
                              {member.isLeader ? (
                                <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                  Leader
                                </span>
                              ) : null}
                            </p>
                            <p className="text-xs text-slate-500">
                              {member.designation?.trim() || "No designation"}
                              {" · "}
                              {member.isVisible ? (
                                <span className="text-emerald-700">Published</span>
                              ) : (
                                <span className="text-amber-700">Draft</span>
                              )}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={busy || index === 0}
                              onClick={() => void moveMember(member.id, "up")}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 disabled:opacity-40"
                            >
                              Up
                            </button>
                            <button
                              type="button"
                              disabled={busy || index === members.length - 1}
                              onClick={() => void moveMember(member.id, "down")}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 disabled:opacity-40"
                            >
                              Down
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <input
                            ref={(el) => {
                              photoInputRefs.current[member.id] = el;
                            }}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="sr-only"
                            aria-label={`Photo for ${member.name ?? member.id}`}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = "";
                              if (file) void uploadPhoto(member.id, file);
                            }}
                          />
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              photoInputRefs.current[member.id]?.click()
                            }
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-800 disabled:opacity-50"
                          >
                            {busy
                              ? "Working…"
                              : member.photoUrl
                                ? "Replace photo"
                                : "Upload photo"}
                          </button>
                          {member.photoUrl ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void removePhoto(member.id)}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 disabled:opacity-50"
                            >
                              Remove photo
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              if (editing) {
                                setEditingId(null);
                              } else {
                                setEditingId(member.id);
                                setEditForm(memberToForm(member));
                              }
                            }}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-800 disabled:opacity-50"
                          >
                            {editing ? "Close" : "Edit"}
                          </button>
                          {member.isVisible ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void setVisibility(member.id, false)}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 disabled:opacity-50"
                            >
                              Unpublish
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void setVisibility(member.id, true)}
                              className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-800 disabled:opacity-50"
                            >
                              Publish
                            </button>
                          )}
                          {member.isVisible && !member.isLeader ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void setLeader(member.id)}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 disabled:opacity-50"
                            >
                              Set leader
                            </button>
                          ) : null}
                          {member.isLeader ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void setLeader(null)}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 disabled:opacity-50"
                            >
                              Clear leader
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void deleteMember(member.id)}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-red-700 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>

                        {editing ? (
                          <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                            {renderMemberFields(editForm, setEditForm, busy)}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void saveMember(member.id)}
                              className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                              style={{
                                backgroundColor: "var(--canopy, #0F6B4C)",
                              }}
                            >
                              {busy ? "Saving…" : "Save member"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
