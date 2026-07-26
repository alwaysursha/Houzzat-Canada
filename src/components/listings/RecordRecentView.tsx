"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { pushLocalRecentView } from "@/lib/recent-views-local";

/** Persist a listing view in localStorage for guest recent-history. */
export function RecordRecentView({ mlsNumber }: { mlsNumber: string }) {
  const { status } = useSession();

  useEffect(() => {
    if (status === "authenticated" || status === "loading") return;
    pushLocalRecentView(mlsNumber);
  }, [mlsNumber, status]);

  return null;
}
