"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { useClientToolsVerification } from "@/components/auth/ClientToolsVerificationProvider";
import { browserCaptureIntentStore } from "@/components/auth/capture-intent-browser";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { UpdateSavedSearchDialog } from "@/components/listings/UpdateSavedSearchDialog";
import { Button } from "@/components/ui/button";
import {
  openGuestSaveSearchIntent,
  clearSavedSearchConfirm,
  readSavedSearchConfirm,
  retainSaveSearchIntentHandler,
  SAVED_SEARCH_NEEDS_CONFIRM_EVENT,
  stableSavedSearchQueryKey,
  withSaveAsNewCaptureFlag,
} from "@/lib/auth/save-search-intent";
import {
  saveAsNewSearch,
  savePrimarySearch,
} from "@/lib/listings/save-primary-search";
import {
  savedSearchDisplayNameFromQuery,
} from "@/lib/listings/saved-search-query";
import { SITE_MESSAGES } from "@/lib/site-messages";
import { cn } from "@/lib/utils";

type SavedSearchItem = {
  id: string;
  name: string;
  query: Record<string, unknown>;
  isPrimary?: boolean;
};

function normalizeQuery(query: Record<string, unknown>): string {
  return stableSavedSearchQueryKey(query);
}

export function SaveSearchButton({
  query,
  signedIn,
  callbackPath,
  className,
  label = "Saved Search",
  /** Prefer “Save as new” confirm copy (never silently overwrite a saved row). */
  saveAsNew = false,
}: {
  query: Record<string, unknown>;
  signedIn: boolean;
  /** Full search URL, including the query string. */
  callbackPath: string;
  className?: string;
  /** Button label (dropdown uses “Save as new”). */
  label?: string;
  saveAsNew?: boolean;
}) {
  const { openAuth } = useAuthModal();
  const { openClientToolsVerification } = useClientToolsVerification();
  const { toast } = useSiteAlert();
  const [savedBaselineKey, setSavedBaselineKey] = useState<string | null>(null);
  const [sessionBaselineKey, setSessionBaselineKey] = useState<string | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(readSavedSearchConfirm);

  const currentKey = useMemo(() => normalizeQuery(query), [query]);

  // Initial page criteria count as "already current" until something changes.
  useEffect(() => {
    setSessionBaselineKey((prev) => prev ?? currentKey);
  }, [currentKey]);

  const refreshSavedBaseline = useCallback(async () => {
    if (!signedIn) {
      setSavedBaselineKey(null);
      return;
    }
    const res = await fetch("/api/saved-searches");
    if (!res.ok) {
      setSavedBaselineKey(null);
      return;
    }
    const data = (await res.json()) as { items?: SavedSearchItem[] };
    const items = data.items ?? [];
    const primary =
      items.find((item) => item.isPrimary) ?? items[0] ?? null;
    setSavedBaselineKey(
      primary ? normalizeQuery(primary.query ?? {}) : null,
    );
  }, [signedIn]);

  useEffect(() => {
    void refreshSavedBaseline();
  }, [refreshSavedBaseline]);

  useEffect(() => {
    function onChanged() {
      void refreshSavedBaseline();
    }
    window.addEventListener("houzzat:saved-searches-changed", onChanged);
    return () =>
      window.removeEventListener("houzzat:saved-searches-changed", onChanged);
  }, [refreshSavedBaseline]);

  useEffect(() => {
    if (readSavedSearchConfirm()) setConfirmOpen(true);
  }, []);

  useEffect(() => {
    function onNeedsConfirm() {
      setConfirmOpen(true);
    }
    window.addEventListener(SAVED_SEARCH_NEEDS_CONFIRM_EVENT, onNeedsConfirm);
    return () =>
      window.removeEventListener(
        SAVED_SEARCH_NEEDS_CONFIRM_EVENT,
        onNeedsConfirm,
      );
  }, []);

  useEffect(() => {
    return retainSaveSearchIntentHandler({
      onSaved: () => {
        toast({
          message: "Search saved to your buyer profile.",
          tone: "success",
        });
      },
      onFailed: () => {
        toast({
          message: SITE_MESSAGES.genericErrorToast,
          tone: "error",
        });
      },
      onVerification: () => {
        openClientToolsVerification({ callbackUrl: callbackPath });
      },
    });
  }, [toast, openClientToolsVerification, callbackPath]);

  const baselineKey = savedBaselineKey ?? sessionBaselineKey;
  const criteriaChanged =
    baselineKey != null && currentKey !== baselineKey;
  const disabled = !criteriaChanged || pending;

  async function persist(confirmReplace: boolean) {
    if (!signedIn) {
      const guestCallback = saveAsNew
        ? withSaveAsNewCaptureFlag(callbackPath)
        : callbackPath;
      const opened = openGuestSaveSearchIntent({
        callbackPath: guestCallback,
        host: window.location.hostname,
        now: Date.now(),
        store: browserCaptureIntentStore(),
        openAuth,
      });
      if (!opened.ok) {
        openAuth({ mode: "sign-in", callbackUrl: guestCallback });
      }
      return;
    }
    setPending(true);
    const name = savedSearchDisplayNameFromQuery(query);
    // Save as new: always create a separate row; never touch Primary / homepage.
    const outcome = saveAsNew
      ? await saveAsNewSearch({ name, query })
      : await savePrimarySearch({
          name,
          query,
          confirmReplace,
        });
    setPending(false);

    if (outcome.status === "auth") {
      openAuth({ mode: "sign-in", callbackUrl: callbackPath });
      return;
    }
    if (outcome.status === "needs_confirm") {
      setConfirmOpen(true);
      return;
    }
    if (outcome.status === "error") {
      toast({
        message: outcome.message || SITE_MESSAGES.genericErrorToast,
        tone: "error",
      });
      return;
    }

    setSavedBaselineKey(currentKey);
    setSessionBaselineKey(currentKey);
    clearSavedSearchConfirm();
    setConfirmOpen(false);
    toast({
      message: saveAsNew
        ? "New search saved. Previous Primary left unchanged."
        : confirmReplace
          ? "Primary search updated. Previous search kept as secondary."
          : "Search saved to your buyer profile.",
      tone: "success",
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled}
        title={
          disabled
            ? "No new search criteria to save"
            : saveAsNew
              ? "Save as a new search (does not overwrite existing)"
              : "Save this search to your buyer profile"
        }
        onClick={() => void persist(false)}
        className={cn("h-8 rounded-full px-2.5", disabled && "border-line/70 text-ink/35", className)}
      >
        {pending ? "Saving…" : label}
      </Button>
      <UpdateSavedSearchDialog
        open={confirmOpen}
        pending={pending}
        saveAsNew={saveAsNew}
        onCancel={() => {
          clearSavedSearchConfirm();
          setConfirmOpen(false);
        }}
        onConfirm={() => void persist(true)}
      />
    </>
  );
}
