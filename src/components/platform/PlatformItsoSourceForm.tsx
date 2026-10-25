"use client";

import { useActionState } from "react";
import {
  saveItsoSourceRequest,
  type ItsoSourceActionState,
} from "@/app/platform/(shell)/workspaces/[workspaceId]/itso-source-action";
import type { ItsoSourceRequest } from "@/lib/listings/itso/itso-sources";

const OPTIONS: Array<{ value: ItsoSourceRequest; label: string; detail: string }> = [
  {
    value: "demo",
    label: "ITSO Demo",
    detail: "Development and testing only. Public production stays empty.",
  },
  {
    value: "live",
    label: "ITSO Live",
    detail: "Turns on only after a credential reference, feed type, active connection, entitlement, and metadata check.",
  },
  {
    value: "disabled",
    label: "Disabled",
    detail: "No ITSO inventory.",
  },
];

export function PlatformItsoSourceForm({
  workspaceId,
  requested,
}: {
  workspaceId: string;
  requested: ItsoSourceRequest | null;
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
