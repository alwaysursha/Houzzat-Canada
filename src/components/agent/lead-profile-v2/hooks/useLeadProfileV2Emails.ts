"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchV2Json } from "@/lib/agent/lead-profile-v2/fetch-json";
import {
  isV2AbortError,
  type LeadProfileV2Session,
} from "@/lib/agent/lead-profile-v2/request-gate";
import {
  V2_EMAILS_RESOURCE_KEY,
  canApplyV2EmailsResponse,
  mergeV2Emails,
  shouldSkipDuplicateV2EmailsAppend,
  v2EmailsAppendCursorKey,
} from "@/lib/agent/lead-profile-v2/emails-query";
import type { LeadProfileV2EmailsPanel } from "@/lib/agent/lead-profile-v2/types";

type EmailsFetchInput = {
  before?: string | null;
  append: boolean;
};

export function useLeadProfileV2Emails(
  session: LeadProfileV2Session,
  leadId: string,
  enabled: boolean,
) {
  const [panel, setPanel] = useState<LeadProfileV2EmailsPanel | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [activeLeadId, setActiveLeadId] = useState(leadId);

  const leadIdRef = useRef(leadId);
  const enabledRef = useRef(enabled);
  const epochRef = useRef(0);
  const loadedForLeadRef = useRef<string | null>(null);
  const lastAppendCursorKeyRef = useRef<string | null>(null);

  if (leadId !== activeLeadId) {
    setActiveLeadId(leadId);
    setPanel(null);
    setError(false);
    setBusy(false);
  }

  const fetchPage = useCallback(
    (input: EmailsFetchInput) => {
      const run = () => {
        const stamp = { leadId, epoch: epochRef.current };
        return async (id: string, signal: AbortSignal) => {
          const apply = () =>
            canApplyV2EmailsResponse({
              stamp,
              current: { leadId: leadIdRef.current, epoch: epochRef.current },
            });
          setBusy(true);
          setError(false);
          try {
            const params = new URLSearchParams();
            if (input.before) params.set("before", input.before);
            const qs = params.toString();
            const json = await fetchV2Json<LeadProfileV2EmailsPanel>(
              `/api/agent/leads-v2/${id}/emails${qs ? `?${qs}` : ""}`,
              "/api/agent/leads-v2/[id]/emails",
              signal,
            );
            if (!apply() || signal.aborted) return;
            loadedForLeadRef.current = id;
            setPanel((prev) => ({
              emails: mergeV2Emails(
                prev?.emails ?? [],
                json.emails,
                input.append,
              ),
              hasMore: json.hasMore,
            }));
          } catch (err) {
            if (isV2AbortError(err) || signal.aborted) return;
            if (!apply()) return;
            if (input.append) {
              lastAppendCursorKeyRef.current = null;
              return;
            }
            setError(true);
          } finally {
            if (apply()) setBusy(false);
          }
        };
      };

      if (input.append) {
        const cursorKey = v2EmailsAppendCursorKey({
          leadId,
          before: input.before ?? null,
        });
        if (
          shouldSkipDuplicateV2EmailsAppend({
            inFlight: session.inspect(V2_EMAILS_RESOURCE_KEY).inFlight,
            lastCursorKey: lastAppendCursorKeyRef.current,
            cursorKey,
          })
        ) {
          return;
        }
        if (
          !session.requestIfIdle(V2_EMAILS_RESOURCE_KEY, leadId, run())
        ) {
          return;
        }
        lastAppendCursorKeyRef.current = cursorKey;
        return;
      }

      epochRef.current += 1;
      lastAppendCursorKeyRef.current = null;
      session.abort(V2_EMAILS_RESOURCE_KEY);
      session.request(V2_EMAILS_RESOURCE_KEY, leadId, run());
    },
    [leadId, session],
  );

  useEffect(() => {
    leadIdRef.current = leadId;
    enabledRef.current = enabled;
    if (loadedForLeadRef.current !== leadId) {
      loadedForLeadRef.current = null;
    }
    if (!enabled) {
      session.abort(V2_EMAILS_RESOURCE_KEY);
      return;
    }
    if (loadedForLeadRef.current === leadId) return;
    fetchPage({ append: false });
  }, [enabled, leadId, fetchPage, session]);

  const reload = useCallback(() => {
    loadedForLeadRef.current = null;
    fetchPage({ append: false });
  }, [fetchPage]);

  const invalidate = useCallback(() => {
    epochRef.current += 1;
    loadedForLeadRef.current = null;
    lastAppendCursorKeyRef.current = null;
    setPanel(null);
    setError(false);
    setBusy(false);
    if (enabledRef.current) fetchPage({ append: false });
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    const last = panel?.emails[panel.emails.length - 1];
    if (!last) return;
    fetchPage({ before: last.createdAt, append: true });
  }, [fetchPage, panel]);

  const loading = enabled && !error && panel === null;

  return {
    panel,
    loading,
    busy,
    error,
    reload,
    invalidate,
    loadMore,
  };
}
