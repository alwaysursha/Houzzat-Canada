"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import {
  clearLocalRecentViews,
  readLocalRecentViews,
} from "@/lib/recent-views-local";

/**
 * After sign-in / sign-up, push guest local recent views into the account DB
 * and clear localStorage.
 */
export function RecentViewsSync() {
  const { status } = useSession();
  const syncedRef = useRef(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      syncedRef.current = false;
      return;
    }
    if (status !== "authenticated" || syncedRef.current) return;

    const local = readLocalRecentViews();
    if (local.length === 0) {
      syncedRef.current = true;
      return;
    }

    syncedRef.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/account/recent-views/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mlsNumbers: local.map((row) => row.mlsNumber),
          }),
        });
        if (res.ok) clearLocalRecentViews();
        else syncedRef.current = false;
      } catch {
        syncedRef.current = false;
      }
    })();
  }, [status]);

  return null;
}
