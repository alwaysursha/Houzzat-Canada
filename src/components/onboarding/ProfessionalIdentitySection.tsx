"use client";

import { useState } from "react";

export type ProfessionalIdentityFields = {
  agentRegisteredName: string;
  agentDesignation: string;
  agentCellPhone: string;
  brokerageRegisteredName: string;
  brokerageFax: string;
  brokeragePhone: string;
  brokerageAddress: string;
};

/** API may return nulls for unset optional/collected fields. */
type ProfessionalIdentityApiFields = {
  agentRegisteredName?: string | null;
  agentDesignation?: string | null;
  agentCellPhone?: string | null;
  brokerageRegisteredName?: string | null;
  brokerageFax?: string | null;
  brokeragePhone?: string | null;
  brokerageAddress?: string | null;
};

type ProfessionalIdentitySectionProps = {
  workspaceId: string;
  status: string;
  initial: ProfessionalIdentityFields;
  brokerageLogoUrl: string | null;
  /** When TEAM, Agent personal fields are optional (brokerage still required). */
  templateCategory?: string;
  onSaved: () => void;
};

const DESIGNATION_HINTS = [
  "Salesperson",
  "Broker",
  "Broker of Record",
  "Real Estate Agent",
] as const;

export function ProfessionalIdentitySection({
  workspaceId,
  status,
  initial,
  brokerageLogoUrl,
  templateCategory = "DEFAULT",
  onSaved,
}: ProfessionalIdentitySectionProps) {
  const [fields, setFields] = useState<ProfessionalIdentityFields>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const agentPersonalRequired = templateCategory !== "TEAM";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "professional_identity",
          workspaceId,
          ...fields,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        message?: string;
        data?: {
          workspace?: {
            professionalIdentity?: ProfessionalIdentityApiFields;
            onboarding?: { professionalIdentityStatus?: string };
          };
        };
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.message || "Unable to save identity");
      }
      const ws = json.data?.workspace;
      if (ws?.professionalIdentity) {
        const identity: ProfessionalIdentityFields = {
          agentRegisteredName: ws.professionalIdentity.agentRegisteredName ?? "",
          agentDesignation: ws.professionalIdentity.agentDesignation ?? "",
          agentCellPhone: ws.professionalIdentity.agentCellPhone ?? "",
          brokerageRegisteredName:
            ws.professionalIdentity.brokerageRegisteredName ?? "",
          brokerageFax:
            ws.professionalIdentity.brokerageFax ?? "",
          brokeragePhone: ws.professionalIdentity.brokeragePhone ?? "",
          brokerageAddress: ws.professionalIdentity.brokerageAddress ?? "",
        };
        setFields(identity);
        onSaved();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save identity");
    } finally {
      setSaving(false);
    }
  }

  const incomplete = status !== "COMPLETE";

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
      <div>
        <h2 className="text-lg font-medium text-slate-900">
          Professional &amp; brokerage information
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Enter once for your workspace. Every website template uses this
          identity — it is not duplicated per theme.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Identity status:{" "}
          <span className="font-medium text-slate-700">{status}</span>
          {incomplete ? (
            <span className="text-amber-700">
              {" "}
              — complete required fields and Brokerage Logo before Website Setup
              is fully complete. Your live site and CRM stay available.
            </span>
          ) : null}
        </p>
      </div>

      <form className="space-y-8" onSubmit={onSubmit}>
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
            Agent information
          </h3>
          <label className="block text-sm text-slate-700">
            Agent name
            {agentPersonalRequired ? (
              <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                Required
              </span>
            ) : (
              <span className="ml-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Optional for Team
              </span>
            )}
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={fields.agentRegisteredName}
              onChange={(e) =>
                setFields((f) => ({
                  ...f,
                  agentRegisteredName: e.target.value,
                }))
              }
              required={agentPersonalRequired}
              autoComplete="name"
            />
          </label>
          <label className="block text-sm text-slate-700">
            Designation
            {agentPersonalRequired ? (
              <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                Required
              </span>
            ) : (
              <span className="ml-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Optional for Team
              </span>
            )}
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={fields.agentDesignation}
              onChange={(e) =>
                setFields((f) => ({ ...f, agentDesignation: e.target.value }))
              }
              required={agentPersonalRequired}
              list="agent-designation-suggestions"
              placeholder="e.g. Salesperson"
            />
            <datalist id="agent-designation-suggestions">
              {DESIGNATION_HINTS.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </label>
          <label className="block text-sm text-slate-700">
            Cell number
            {agentPersonalRequired ? (
              <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                Required
              </span>
            ) : (
              <span className="ml-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Optional for Team
              </span>
            )}
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={fields.agentCellPhone}
              onChange={(e) =>
                setFields((f) => ({ ...f, agentCellPhone: e.target.value }))
              }
              required={agentPersonalRequired}
              inputMode="tel"
              autoComplete="tel"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Agent mobile — separate from Business phone in Business profile.
            </span>
          </label>
        </div>

        <div className="space-y-4 border-t border-slate-100 pt-6">
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
            Brokerage information
          </h3>
          <label className="block text-sm text-slate-700">
            Brokerage name
            <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
              Required
            </span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={fields.brokerageRegisteredName}
              onChange={(e) =>
                setFields((f) => ({
                  ...f,
                  brokerageRegisteredName: e.target.value,
                }))
              }
              required
            />
            <span className="mt-1 block text-xs text-slate-500">
              Registered brokerage name — not the same as Business display name.
            </span>
          </label>
          <label className="block text-sm text-slate-700">
            Brokerage address
            <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
              Required
            </span>
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              rows={3}
              value={fields.brokerageAddress}
              onChange={(e) =>
                setFields((f) => ({ ...f, brokerageAddress: e.target.value }))
              }
              required
            />
          </label>
          <label className="block text-sm text-slate-700">
            Brokerage phone
            <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
              Required
            </span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={fields.brokeragePhone}
              onChange={(e) =>
                setFields((f) => ({ ...f, brokeragePhone: e.target.value }))
              }
              required
              inputMode="tel"
            />
          </label>
          <label className="block text-sm text-slate-700">
            Brokerage Fax
            <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
              Required
            </span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={fields.brokerageFax}
              onChange={(e) =>
                setFields((f) => ({
                  ...f,
                  brokerageFax: e.target.value,
                }))
              }
              required
              inputMode="tel"
            />
          </label>

          <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-800">
              Brokerage logo
              <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                Required
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Upload and manage the Brokerage Logo in Brand assets below. It is
              required for identity completion and appears in the public site
              footer.
            </p>
            <div className="mt-3 flex h-16 max-w-[12rem] items-center justify-center overflow-hidden bg-white">
              {brokerageLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={brokerageLogoUrl}
                  alt=""
                  className="max-h-full max-w-full object-contain p-2"
                />
              ) : (
                <span className="px-2 text-center text-[11px] text-amber-700">
                  Missing — upload Brokerage Logo in Brand assets
                </span>
              )}
            </div>
          </div>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--canopy, #0F6B4C)" }}
        >
          {saving ? "Saving…" : "Save professional & brokerage information"}
        </button>
      </form>
    </section>
  );
}
