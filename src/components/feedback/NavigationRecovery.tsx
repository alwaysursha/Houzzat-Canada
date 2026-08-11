"use client";

import { useEffect } from "react";

const RELOAD_KEY = "houzzat:nav-recovery-reload";

/**
 * Next aborts in-flight RSC/fetch when the user navigates again quickly.
 * Those cancellations are normal — never hard-reload for them.
 */
function isNavigationAbort(message: string, error?: unknown): boolean {
  if (error instanceof DOMException || error instanceof Error) {
    if (error.name === "AbortError") return true;
  }
  return /AbortError|\baborted\b|AbortSignal|The user aborted|The operation was aborted|signal is aborted|Request aborted|Fetch aborted/i.test(
    message,
  );
}

function isRecoverableNavError(message: string, error?: unknown): boolean {
  // Abort first so "Failed to fetch" (or similar) never reloads cancel races.
  if (isNavigationAbort(message, error)) return false;
  return /ChunkLoadError|Loading chunk|CSS_CHUNK_LOAD_FAILED|Failed to fetch|NetworkError|fetch failed|Unexpected token|dynamically imported module/i.test(
    message,
  );
}

function reloadOnce(reason: string) {
  if (typeof window === "undefined") return;
  try {
    const last = sessionStorage.getItem(RELOAD_KEY);
    const now = String(Date.now());
    // Avoid reload loops: at most once every 8s.
    if (last && Date.now() - Number(last) < 8_000) return;
    sessionStorage.setItem(RELOAD_KEY, now);
    console.warn("[nav-recovery] reloading after", reason);
    window.location.reload();
  } catch {
    window.location.reload();
  }
}

/**
 * Post-deploy chunk mismatches and real network failures often surface as
 * client fetch/chunk errors. Recover with a single hard reload.
 * Rapid soft-nav cancellations (AbortError) are ignored — they are not failures.
 */
export function NavigationRecovery() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      const message = [
        event.message,
        event.error instanceof Error ? event.error.message : "",
        event.error instanceof Error ? event.error.name : "",
      ].join(" ");
      if (isRecoverableNavError(message, event.error)) {
        event.preventDefault();
        reloadOnce(message.slice(0, 120));
      }
    }

    function onRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? `${reason.name} ${reason.message}`
          : String(reason ?? "");
      if (isRecoverableNavError(message, reason)) {
        event.preventDefault();
        reloadOnce(message.slice(0, 120));
      }
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
