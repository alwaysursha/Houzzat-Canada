"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LeadQuickPopup } from "@/components/agent/LeadQuickPopup";
import {
  LEAD_QUERY_CHANGE_EVENT,
  readLeadNavIds,
  readLeadQueryParam,
  replaceLeadQueryParam,
} from "@/lib/agent/lead-profile-query";

export {
  LEAD_NAV_STORAGE_KEY,
  openLeadProfileHref,
  rememberLeadNavIds,
} from "@/lib/agent/lead-profile-query";

/** Opens lead profile popup from `?lead=` and clears the param on close. */
export function LeadQueryPopup({
  fallbackLeadIds = [],
}: {
  /** Used when session nav list is missing (e.g. deep link / kanban). */
  fallbackLeadIds?: string[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [leadIds, setLeadIds] = useState<string[]>([]);

  // Sync from Next navigation (deep links, tasks/inbox) and initial browser URL.
  useEffect(() => {
    setActiveLeadId(readLeadQueryParam() ?? searchParams.get("lead"));
  }, [searchParams]);

  // Same-page History API updates (open / next / prev / close without Next router).
  useEffect(() => {
    function onLeadQueryChange(event: Event) {
      const detail = (event as CustomEvent<{ leadId: string | null }>).detail;
      setActiveLeadId(detail.leadId);
    }
    function onPopState() {
      setActiveLeadId(readLeadQueryParam());
    }
    window.addEventListener(LEAD_QUERY_CHANGE_EVENT, onLeadQueryChange);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener(LEAD_QUERY_CHANGE_EVENT, onLeadQueryChange);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  useEffect(() => {
    if (!activeLeadId) return;
    const stored = readLeadNavIds();
    if (stored.includes(activeLeadId)) {
      setLeadIds(stored);
      return;
    }
    if (fallbackLeadIds.includes(activeLeadId)) {
      setLeadIds(fallbackLeadIds);
      return;
    }
    setLeadIds(stored.length ? stored : fallbackLeadIds);
  }, [activeLeadId, fallbackLeadIds]);

  const close = useCallback(() => {
    setActiveLeadId(null);
    if (pathname === "/agent/leads") {
      replaceLeadQueryParam(null);
    }
  }, [pathname]);

  const navigate = useCallback(
    (nextLeadId: string) => {
      setActiveLeadId(nextLeadId);
      if (pathname === "/agent/leads") {
        replaceLeadQueryParam(nextLeadId);
      }
    },
    [pathname],
  );

  if (!activeLeadId) return null;

  return (
    <LeadQuickPopup
      leadId={activeLeadId}
      leadIds={leadIds}
      onClose={close}
      onNavigate={navigate}
    />
  );
}
