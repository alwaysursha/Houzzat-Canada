"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AgentPortraitFocusUploader } from "@/components/agent/AgentPortraitFocusUploader";
import {
  AgentProfessionalFields,
  type AgentProfessionalFormValue,
} from "@/components/agent/AgentProfessionalFields";
import { Button } from "@/components/ui/button";
import type { AdminManagedAgentProfileView } from "@/lib/agent/admin-managed-profile";

export function AgentProfileAdminClient({
  profile,
}: {
  profile: AdminManagedAgentProfileView;
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
  const [photoUrl, setPhotoUrl] = useState(profile.photoUrl);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/agent/team/members/${profile.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error || "Could not save Agent profile.");
        return;
      }
      setMsg("Agent profile saved.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/agent/team"
          className="text-xs font-semibold text-canopy hover:underline"
        >
          ← Team
        </Link>
        <h1 className="mt-2 font-display text-4xl text-ink">
          {profile.firstName || profile.lastName
            ? `${profile.firstName} ${profile.lastName}`.trim()
            : profile.email}
        </h1>
        <p className="mt-2 text-sm text-ink/60">
          {profile.canEdit
            ? "Professional and contact information. Lead assignments are not changed by these edits."
            : "You can view this Agent profile. Owners, admins, or the agent themselves can edit it."}
        </p>
      </div>

      {profile.canEditPhoto ? (
        <AgentPortraitFocusUploader
          photoUrl={photoUrl}
          userId={profile.userId}
          onUploaded={(next) => {
            setPhotoUrl(next);
            setMsg("Profile photo saved.");
            router.refresh();
          }}
        />
      ) : null}

      <form
        className="rounded-2xl border border-line bg-surface p-5 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (profile.canEdit) void save();
        }}
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-canopy">
          Professional identity
        </p>
        <div className="mt-4">
          <AgentProfessionalFields
            idPrefix="agent-profile"
            value={value}
            onChange={setValue}
            disabled={!profile.canEdit}
            readOnly={!profile.canEdit}
          />
        </div>
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
