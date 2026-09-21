"use client";

import { useRef, useState } from "react";
import { useOnboardingDraftFlush } from "@/components/onboarding/onboarding-draft-flush";

type BrandAssets = {
  agentProfilePhotoUrl: string | null;
  logoUrl: string | null;
  brokerageLogoUrl: string | null;
  faviconUrl: string | null;
};

type AssetKind = "agent-profile" | "logo" | "brokerage-logo" | "favicon";

type BrandAssetsSectionProps = {
  workspaceId: string;
  templateCategory: string;
  brandingStatus: string;
  assets: BrandAssets;
  onAssetsChange: (next: BrandAssets, brandingStatus: string) => void;
};

function AssetRow({
  label,
  hint,
  kind,
  url,
  required,
  requiredLabel = "Required for Agent templates",
  allowRemove,
  busyKind,
  onUpload,
  onRemove,
}: {
  label: string;
  hint: string;
  kind: AssetKind;
  url: string | null;
  required?: boolean;
  requiredLabel?: string;
  allowRemove: boolean;
  busyKind: AssetKind | null;
  onUpload: (kind: AssetKind, file: File) => void;
  onRemove: (kind: AssetKind) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = busyKind === kind;
  const isPortrait = kind === "agent-profile";

  return (
    <div className="flex flex-col gap-4 border-t border-slate-100 pt-5 sm:flex-row sm:items-start">
      <div
        className={
          isPortrait
            ? "relative aspect-[3/4] w-full max-w-[9rem] overflow-hidden bg-slate-100 sm:w-36"
            : "relative flex h-20 w-full max-w-[9rem] items-center justify-center overflow-hidden bg-slate-100 sm:w-36"
        }
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className={
              isPortrait
                ? "absolute inset-0 h-full w-full object-cover object-top"
                : "max-h-full max-w-full object-contain p-2"
            }
          />
        ) : (
          <span className="px-2 text-center text-[11px] text-slate-400">
            No image
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="text-sm font-medium text-slate-900">
            {label}
            {required ? (
              <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                {requiredLabel}
              </span>
            ) : (
              <span className="ml-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Optional
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-slate-500">{hint}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label={`${label} file`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onUpload(kind, file);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-800 disabled:opacity-50"
          >
            {busy ? "Uploading…" : url ? "Replace" : "Upload"}
          </button>
          {allowRemove && url ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onRemove(kind)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 disabled:opacity-50"
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Stage 6.11C.1 — Website Setup brand assets (host-bound OWNER uploads).
 */
export function BrandAssetsSection({
  workspaceId,
  templateCategory,
  brandingStatus,
  assets,
  onAssetsChange,
}: BrandAssetsSectionProps) {
  const [busyKind, setBusyKind] = useState<AssetKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { flushAll } = useOnboardingDraftFlush();

  async function upload(kind: AssetKind, file: File) {
    setBusyKind(kind);
    setError(null);
    setMessage(null);
    try {
      await flushAll();
      const body = new FormData();
      body.set("kind", kind);
      body.set("file", file);
      body.set("workspaceId", workspaceId);
      const res = await fetch("/api/onboarding/branding-assets", {
        method: "POST",
        body,
      });
      const json = (await res.json()) as {
        ok: boolean;
        message?: string;
        data?: {
          assets: BrandAssets & { brandingStatus?: string };
        };
      };
      if (!res.ok || !json.ok || !json.data?.assets) {
        setError(json.message ?? "Upload failed.");
        return;
      }
      const next = json.data.assets;
      onAssetsChange(
        {
          agentProfilePhotoUrl: next.agentProfilePhotoUrl,
          logoUrl: next.logoUrl,
          brokerageLogoUrl: next.brokerageLogoUrl,
          faviconUrl: next.faviconUrl,
        },
        next.brandingStatus ?? brandingStatus,
      );
      setMessage("Brand asset saved.");
    } catch {
      setError("Network error while uploading.");
    } finally {
      setBusyKind(null);
    }
  }

  async function remove(kind: AssetKind) {
    setBusyKind(kind);
    setError(null);
    setMessage(null);
    try {
      await flushAll();
      const res = await fetch("/api/onboarding/branding-assets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, workspaceId }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        message?: string;
        data?: {
          assets: BrandAssets & { brandingStatus?: string };
        };
      };
      if (!res.ok || !json.ok || !json.data?.assets) {
        setError(json.message ?? "Remove failed.");
        return;
      }
      const next = json.data.assets;
      onAssetsChange(
        {
          agentProfilePhotoUrl: next.agentProfilePhotoUrl,
          logoUrl: next.logoUrl,
          brokerageLogoUrl: next.brokerageLogoUrl,
          faviconUrl: next.faviconUrl,
        },
        next.brandingStatus ?? brandingStatus,
      );
      setMessage("Brand asset removed.");
    } catch {
      setError("Network error while removing.");
    } finally {
      setBusyKind(null);
    }
  }

  const agentRequired = templateCategory === "AGENT";
  const teamLogoRequired = templateCategory === "TEAM";

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
      <div>
        <h2 className="text-lg font-medium text-slate-900">Brand assets</h2>
        <p className="mt-1 text-sm text-slate-600">
          Workspace branding used by your website templates. Upload once —
          switching themes does not require re-upload.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Branding status:{" "}
          <span className="font-medium text-slate-700">{brandingStatus}</span>
          {agentRequired && brandingStatus !== "COMPLETE" ? (
            <span className="text-amber-700">
              {" "}
              — add an Agent Profile Photo to complete Agent branding.
            </span>
          ) : null}
          {teamLogoRequired && brandingStatus !== "COMPLETE" ? (
            <span className="text-amber-700">
              {" "}
              — add a Team Logo to complete Team branding.
            </span>
          ) : null}
        </p>
      </div>

      <AssetRow
        label="Agent Profile Photo"
        hint="Used by Agent Signature Hero and Meet sections (same image)."
        kind="agent-profile"
        url={assets.agentProfilePhotoUrl}
        required={agentRequired}
        allowRemove
        busyKind={busyKind}
        onUpload={upload}
        onRemove={remove}
      />
      <AssetRow
        label={teamLogoRequired ? "Team Logo" : "Primary Logo"}
        hint={
          teamLogoRequired
            ? "Required for Team Signature header and brand mark."
            : "Optional mark for header/footer where the template shows a logo."
        }
        kind="logo"
        url={assets.logoUrl}
        required={teamLogoRequired}
        requiredLabel="Required for Team templates"
        allowRemove
        busyKind={busyKind}
        onUpload={upload}
        onRemove={remove}
      />
      <AssetRow
        label="Brokerage Logo"
        hint="Required for Professional & brokerage information. Shown in the public site footer."
        kind="brokerage-logo"
        url={assets.brokerageLogoUrl}
        required
        requiredLabel="Required for website identity"
        allowRemove
        busyKind={busyKind}
        onUpload={upload}
        onRemove={remove}
      />
      <AssetRow
        label="Favicon"
        hint="Optional. Remove to restore the generated tenant favicon."
        kind="favicon"
        url={assets.faviconUrl}
        allowRemove
        busyKind={busyKind}
        onUpload={upload}
        onRemove={remove}
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
    </section>
  );
}
