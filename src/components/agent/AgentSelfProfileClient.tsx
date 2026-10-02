"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AgentPortraitFocusUploader } from "@/components/agent/AgentPortraitFocusUploader";
import {
  AgentProfessionalFields,
  type AgentProfessionalFormValue,
} from "@/components/agent/AgentProfessionalFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminManagedAgentProfileView } from "@/lib/agent/admin-managed-profile";

export function AgentSelfProfileClient({
  profile,
  workspaceId,
}: {
  profile: AdminManagedAgentProfileView;
  workspaceId: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState<AgentProfessionalFormValue>({
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    phone: profile.phone,
    recoLicenseNumber: profile.recoLicenseNumber,
    recoLicenseExpiresAt: profile.recoLicenseExpiresAt,
  });
  const [designation, setDesignation] = useState(profile.designation);
  const [photoUrl, setPhotoUrl] = useState(profile.photoUrl);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!profile.canEdit) return;
    setPending(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/agent/team/members/${profile.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...value,
          designation,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error || "Could not save profile.");
        return;
      }
      setMsg("Profile saved.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-4xl text-ink">Your profile</h1>
        <p className="mt-2 text-sm text-ink/60">
          Update the details shown to leads and on your public listings.
        </p>
      </div>

      {profile.canEditPhoto ? (
        <AgentPortraitFocusUploader
          photoUrl={photoUrl}
          workspaceId={workspaceId}
          onUploaded={(next) => {
            setPhotoUrl(next);
            setMsg("Profile photo saved.");
            router.refresh();
          }}
        />
      ) : null}

      <form
        className="rounded-2xl border border-line bg-surface p-5 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-canopy">
          Professional identity
        </p>
        <div className="mt-4">
          <AgentProfessionalFields
            idPrefix="self-profile"
            value={value}
            onChange={setValue}
            disabled={!profile.canEdit}
            readOnly={!profile.canEdit}
          />
        </div>

        {profile.canEditPhoto || profile.designation || profile.role === "OWNER" ? (
          <div className="mt-4">
            <label
              htmlFor="self-profile-title"
              className="text-xs font-semibold text-ink/70"
            >
              Title / designation
            </label>
            <Input
              id="self-profile-title"
              className="mt-1.5"
              value={designation}
              disabled={!profile.canEdit}
              placeholder="Salesperson, Broker, …"
              onChange={(event) => setDesignation(event.target.value)}
            />
            <p className="mt-1 text-[11px] text-ink/45">
              Shown under your name on listing pages.
            </p>
          </div>
        ) : null}

        {profile.canEdit ? (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save profile"}
            </Button>
            {msg ? <p className="text-sm text-ink/55">{msg}</p> : null}
            {error ? <p className="text-sm text-[#b91c1c]">{error}</p> : null}
          </div>
        ) : (
          <p className="mt-4 text-xs text-ink/45">Read only</p>
        )}
      </form>
    </div>
  );
}
