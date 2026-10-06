"use client";

import { useEffect, useRef, useState } from "react";
import { EntityAlertSwitchRow } from "@/components/account/EntityAlertSwitchRow";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import {
  buildSavedSearchEmailAlertsPatch,
  isCurrentMutationGeneration,
  nextMutationGeneration,
  resolveToggleMutationOutcome,
} from "@/lib/account/entity-alert-mutations";

export function SavedSearchEmailAlertsToggle({
  id,
  initialEmailAlerts,
  isPrimary,
}: {
  id: string;
  initialEmailAlerts: boolean;
  isPrimary?: boolean;
}) {
  const { toast } = useSiteAlert();
  const [emailAlerts, setEmailAlerts] = useState(initialEmailAlerts);
  const [pending, setPending] = useState(false);
  const generations = useRef(new Map<string, number>());
  const inFlight = useRef(false);

  useEffect(() => {
    setEmailAlerts(initialEmailAlerts);
  }, [initialEmailAlerts]);

  async function onToggle(next: boolean) {
    const key = `saved-search:${id}:emailAlerts`;
    if (inFlight.current) return;

    const previous = emailAlerts;
    const generation = nextMutationGeneration(generations.current, key);
    inFlight.current = true;
    setPending(true);
    setEmailAlerts(next);

    try {
      const res = await fetch("/api/saved-searches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSavedSearchEmailAlertsPatch(id, next)),
      });
      const json = res.ok
        ? ((await res.json()) as {
            ok?: boolean;
            item?: { emailAlerts?: boolean };
          })
        : null;
      const serverConfirmed =
        res.ok && typeof json?.item?.emailAlerts === "boolean"
          ? json.item.emailAlerts
          : res.ok
            ? next
            : null;

      if (!isCurrentMutationGeneration(generations.current, key, generation)) {
        return;
      }

      const resolved = resolveToggleMutationOutcome({
        generation,
        latestGeneration: generations.current.get(key) ?? generation,
        previous,
        serverConfirmed,
      });
      if (resolved != null) setEmailAlerts(resolved);

      if (serverConfirmed == null) {
        toast({
          message: "Could not update email alerts. Please try again.",
          tone: "error",
        });
        return;
      }

      toast({
        message: next
          ? "Email alerts turned on for this saved search."
          : "Email alerts turned off for this saved search.",
        tone: "success",
      });
      window.dispatchEvent(new Event("houzzat:saved-searches-changed"));
    } catch {
      if (isCurrentMutationGeneration(generations.current, key, generation)) {
        setEmailAlerts(previous);
        toast({
          message: "Could not update email alerts. Please try again.",
          tone: "error",
        });
      }
    } finally {
      if (isCurrentMutationGeneration(generations.current, key, generation)) {
        inFlight.current = false;
        setPending(false);
      }
    }
  }

  return (
    <div className="w-full min-w-[12rem] max-w-sm rounded-lg border border-line/80 bg-mist/40 px-3 py-2">
      <EntityAlertSwitchRow
        id={`saved-search-email-${id}`}
        label="Email alerts"
        hint={
          isPrimary
            ? "Controls email updates for this saved search. As your primary search, this also affects Buyer Digest eligibility."
            : "Controls email updates for this saved search."
        }
        checked={emailAlerts}
        pending={pending}
        onCheckedChange={(next) => void onToggle(next)}
      />
    </div>
  );
}
