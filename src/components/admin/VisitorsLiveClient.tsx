"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Soft refresh live visitor board. */
export function VisitorsLiveClient({ intervalMs = 20_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, router]);

  return (
    <p className="text-xs text-ink/40">
      Auto-refreshes every {Math.round(intervalMs / 1000)}s
    </p>
  );
}
