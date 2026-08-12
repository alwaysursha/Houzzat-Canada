"use client";

import { useEffect } from "react";
import {
  isStaleNextAssetFailure,
  reloadOnceForStaleBuild,
  staleAssetUrlFromEvent,
} from "@/lib/navigation/stale-build-recovery";

function eventMessage(event: ErrorEvent) {
  return [
    event.message,
    event.filename,
    event.error instanceof Error ? event.error.name : "",
    event.error instanceof Error ? event.error.message : "",
  ].join(" ");
}

function rejectionMessage(reason: unknown) {
  if (reason instanceof Error) return `${reason.name} ${reason.message}`;
  return String(reason ?? "");
}

/**
 * After a deploy, an old tab requests hashed /_next/static files that 404.
 * Recover with one hard reload. Abort/cancel and API errors are ignored.
 */
export function NavigationRecovery() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      const assetUrl = staleAssetUrlFromEvent(event);
      const message = eventMessage(event);
      if (!isStaleNextAssetFailure(message, event.error, assetUrl)) return;
      event.preventDefault();
      reloadOnceForStaleBuild(assetUrl || message);
    }

    function onRejection(event: PromiseRejectionEvent) {
      const message = rejectionMessage(event.reason);
      if (!isStaleNextAssetFailure(message, event.reason)) return;
      event.preventDefault();
      reloadOnceForStaleBuild(message);
    }

    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
