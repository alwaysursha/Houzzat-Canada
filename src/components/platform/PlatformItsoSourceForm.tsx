"use client";

import { useActionState } from "react";
import {
  saveItsoSourceRequest,
  type ItsoSourceActionState,
} from "@/app/platform/(shell)/workspaces/[workspaceId]/itso-source-action";
import type { HighOctaneListingSourceRequest } from "@/lib/tenancy/templates/high-octane-proptx-source";

const OPTIONS: Array<{ value: HighOctaneListingSourceRequest; label: string; detail: string }> = [
  {
    value: "proptx-idx",
    label: "PropTx IDX",
    detail:
      "Saad's own TRREB IDX feed. It turns on only after his credential reference, verified participant membership, an ACTIVE connection, ACTIVE_LISTINGS entitlement, an ACTIVE primary domain, and TRREB IDX website approval. A PropTx subscription alone is not API access.",
  },
  {
    value: "proptx-vow",
    label: "PropTx VOW",
    detail:
      "Separate VOW agreement for registered clients. IDX approval does not include it.",
  },
  {
    value: "demo",
    label: "Protected demo",
    detail: "Development and testing only. Public production stays empty.",
  },
  {
    value: "disabled",
    label: "Disabled",
    detail: "No listing inventory.",
  },
];

export function PlatformItsoSourceForm({
  workspaceId,
  requested,
}: {
  workspaceId: string;
  requested: HighOctaneListingSourceRequest | null;
}) {
  const [state, action, pending] = useActionState<ItsoSourceActionState | null, FormData>(
    saveItsoSourceRequest,
    null,
  );
  const selected = requested ?? "disabled";

  return (
    <form action={action} className="mt-4 space-y-3 border-t border-slate-800 pt-4">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <fieldset className="space-y-2">
        <legend className="text-xs uppercase tracking-wide text-slate-500">Source selector</legend>
        {OPTIONS.map((option) => (
          <label key={option.value} className="flex gap-3 text-sm text-slate-200">
            <input
              type="radio"
              name="requested"
              value={option.value}
              defaultChecked={selected === option.value}
              className="mt-1"
            />
            <span>
              <span className="font-medium">{option.label}</span>
              <span className="mt-0.5 block text-xs text-slate-400">{option.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-950 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save source"}
      </button>
      {state ? (
        <p className={state.ok ? "text-sm text-emerald-300" : "text-sm text-amber-200"}>
          {state.message}
          {state.blockers.length > 0 ? ` ${state.blockers[0]}` : ""}
        </p>
      ) : null}
    </form>
  );
}
