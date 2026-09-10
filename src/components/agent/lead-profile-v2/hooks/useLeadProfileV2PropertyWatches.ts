"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchV2Json } from "@/lib/agent/lead-profile-v2/fetch-json";
import {
  isV2AbortError,
  type LeadProfileV2Session,
} from "@/lib/agent/lead-profile-v2/request-gate";
import {
  V2_PROPERTY_WATCHES_RESOURCE_KEY,
  canApplyV2PropertyWatchesResponse,
} from "@/lib/agent/lead-profile-v2/property-watches-query";
import type { LeadProfileV2PropertyWatchesPanel } from "@/lib/agent/lead-profile-v2/types";

export function useLeadProfileV2PropertyWatches(
  session: LeadProfileV2Session,
  leadId: string,
  enabled: boolean,
) {
  const [panel, setPanel] = useState<LeadProfileV2PropertyWatchesPanel | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [activeLeadId, setActiveLeadId] = useState(leadId);

  const leadIdRef = useRef(leadId);
  const enabledRef = useRef(enabled);
  const epochRef = useRef(0);
  const loadedForLeadRef = useRef<string | null>(null);

  if (leadId !== activeLeadId) {
    setActiveLeadId(leadId);
    setPanel(null);
    setError(false);
    setBusy(false);
  }

  const fetchPanel = useCallback(() => {
    epochRef.current += 1;
    const stamp = { leadId, epoch: epochRef.current };
    session.abort(V2_PROPERTY_WATCHES_RESOURCE_KEY);
    session.request(
      V2_PROPERTY_WATCHES_RESOURCE_KEY,
      leadId,
      async (id, signal) => {
        const apply = () =>
          canApplyV2PropertyWatchesResponse({
            stamp,
            current: { leadId: leadIdRef.current, epoch: epochRef.current },
          });
        setBusy(true);
        setError(false);
        try {
          const json = await fetchV2Json<LeadProfileV2PropertyWatchesPanel>(
            `/api/agent/leads-v2/${id}/property-watches`,
            "/api/agent/leads-v2/[id]/property-watches",
            signal,
          );
          if (!apply() || signal.aborted) return;
          loadedForLeadRef.current = id;
          setPanel(json);
        } catch (err) {
          if (isV2AbortError(err) || signal.aborted) return;
          if (!apply()) return;
          setError(true);
        } finally {
          if (apply()) setBusy(false);
        }
      },
    );
  }, [leadId, session]);

  useEffect(() => {
    leadIdRef.current = leadId;
    enabledRef.current = enabled;
    if (loadedForLeadRef.current !== leadId) {
      loadedForLeadRef.current = null;
    }
    if (!enabled) {
      session.abort(V2_PROPERTY_WATCHES_RESOURCE_KEY);
      return;
    }
    if (loadedForLeadRef.current === leadId) return;
    fetchPanel();
  }, [enabled, leadId, fetchPanel, session]);

  const reload = useCallback(() => {
    loadedForLeadRef.current = null;
    fetchPanel();
  }, [fetchPanel]);

  const invalidate = useCallback(() => {
    epochRef.current += 1;
    loadedForLeadRef.current = null;
    setPanel(null);
    setError(false);
    setBusy(false);
    if (enabledRef.current) fetchPanel();
  }, [fetchPanel]);

  const loading = enabled && !error && (busy || panel === null);

  return {
    panel,
    loading,
    error,
    reload,
    invalidate,
  };
}
