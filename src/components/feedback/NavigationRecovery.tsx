"use client";

import { useEffect } from "react";

const RELOAD_KEY = "houzzat:nav-recovery-reload";

function isRecoverableNavError(message: string) {
  return /ChunkLoadError|Loading chunk|CSS_CHUNK_LOAD_FAILED|Failed to fetch|NetworkError|fetch failed|aborted|AbortError|Unexpected token|dynamically imported module/i.test(
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
 * Soft-nav races (clicking links quickly) and post-deploy chunk mismatches
 * often surface as client fetch/chunk errors. Recover with a single hard
 * reload instead of leaving the user on the hiccup screen.
 */
export function NavigationRecovery() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      const message = [
        event.message,
        event.error instanceof Error ? event.error.message : "",
        event.error instanceof Error ? event.error.name : "",
      ].join(" ");
      if (isRecoverableNavError(message)) {
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
      if (isRecoverableNavError(message)) {
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
