"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkspaceChooserOption = {
  workspaceId: string;
  name: string;
  brokerageAffiliation: string | null;
  role: string;
  selected?: boolean;
};

export function WorkspaceChooserClient({
  memberships,
  currentWorkspaceId,
}: {
  memberships: WorkspaceChooserOption[];
  currentWorkspaceId: string | null;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function selectWorkspace(workspaceId: string) {
    if (pendingId) return;
    setPendingId(workspaceId);
    setError(null);
    try {
      const res = await fetch("/api/agent/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Could not select workspace");
      }
      // Hard navigation clears stale CRM overlays / popups from prior workspace.
      window.location.assign("/agent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Selection failed");
      setPendingId(null);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-lg flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Building2 className="h-7 w-7" aria-hidden />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Choose your workspace
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You have access to multiple HouzzatPRO workspaces. Select one to
          continue.
        </p>
      </div>

      <ul className="space-y-3" role="listbox" aria-label="Workspaces">
        {memberships.map((m) => {
          const isSelected = currentWorkspaceId === m.workspaceId;
          const isPending = pendingId === m.workspaceId;
          return (
            <li key={m.workspaceId}>
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={Boolean(pendingId)}
                onClick={() => selectWorkspace(m.workspaceId)}
                className={cn(
                  "flex w-full items-center gap-4 rounded-2xl border px-4 py-4 text-left transition",
                  "hover:border-primary/40 hover:bg-muted/40",
                  "disabled:cursor-not-allowed disabled:opacity-70",
                  isSelected && "border-primary bg-primary/5",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{m.name}</div>
                  {m.brokerageAffiliation ? (
                    <div className="truncate text-sm text-muted-foreground">
                      {m.brokerageAffiliation}
                    </div>
                  ) : null}
                  <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                    {m.role.toLowerCase()}
                  </div>
                </div>
                {isPending ? (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
                ) : isSelected ? (
                  <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      {error ? (
        <p className="mt-4 text-center text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {memberships.length > 1 && currentWorkspaceId ? (
        <button
          type="button"
          className="mt-8 text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => router.refresh()}
        >
          Refresh
        </button>
      ) : null}
    </div>
  );
}
