"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { LeadQuickPopup } from "@/components/agent/LeadQuickPopup";

export const LEAD_NAV_STORAGE_KEY = "houzzat-lead-nav-ids";

export function rememberLeadNavIds(ids: string[]) {
  try {
    sessionStorage.setItem(LEAD_NAV_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // ignore quota / private mode
  }
}

function readLeadNavIds(): string[] {
  try {
    const raw = sessionStorage.getItem(LEAD_NAV_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

/** Opens lead profile popup from `?lead=` and clears the param on close. */
export function LeadQueryPopup({
  leadId,
  fallbackLeadIds = [],
}: {
  leadId: string | null;
  /** Used when session nav list is missing (e.g. deep link / kanban). */
  fallbackLeadIds?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [leadIds, setLeadIds] = useState<string[]>([]);

  useEffect(() => {
    if (!leadId) return;
    const stored = readLeadNavIds();
    if (stored.includes(leadId)) {
      setLeadIds(stored);
      return;
    }
    if (fallbackLeadIds.includes(leadId)) {
      setLeadIds(fallbackLeadIds);
      return;
    }
    setLeadIds(stored.length ? stored : fallbackLeadIds);
  }, [leadId, fallbackLeadIds]);

  if (!leadId) return null;

  function hrefForLead(nextLeadId: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("lead", nextLeadId);
    return `${pathname}?${next.toString()}`;
  }

  function close() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("lead");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function navigate(nextLeadId: string) {
    router.replace(hrefForLead(nextLeadId), { scroll: false });
  }

  return (
    <LeadQuickPopup
      leadId={leadId}
      leadIds={leadIds}
      onClose={close}
      onNavigate={navigate}
    />
  );
}

export function openLeadProfileHref(
  leadId: string,
  extras?: Record<string, string | undefined>,
) {
  const q = new URLSearchParams();
  q.set("lead", leadId);
  if (extras) {
    for (const [key, value] of Object.entries(extras)) {
      if (value) q.set(key, value);
    }
  }
  return `/agent/leads?${q.toString()}`;
}
