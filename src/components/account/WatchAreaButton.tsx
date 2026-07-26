"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { Button } from "@/components/ui/button";
import { SITE_MESSAGES } from "@/lib/site-messages";
import { cn } from "@/lib/utils";

type AreaMonitorRow = {
  id: string;
  city: string;
  community: string | null;
  transactionType: string;
  segment: string | null;
};

function watchSegmentOf(
  segment?: "RESIDENTIAL" | "COMMERCIAL" | "ALL",
): "RESIDENTIAL" | "COMMERCIAL" {
  return segment === "COMMERCIAL" ? "COMMERCIAL" : "RESIDENTIAL";
}

function matchesMonitor(
  item: AreaMonitorRow,
  city: string,
  community: string | null,
  transactionType: string,
  segment: string,
) {
  return (
    item.city.toLowerCase() === city.toLowerCase() &&
    (item.community ?? null) === community &&
    item.transactionType === transactionType &&
    (item.segment ?? "RESIDENTIAL") === segment
  );
}

export function WatchAreaButton({
  city,
  community,
  transactionType,
  segment,
  signedIn,
  idleLabel = "Watch this area",
  activeLabel = "Area watched",
  authCallbackUrl = "/search",
  className,
}: {
  city: string;
  community?: string;
  transactionType: "SALE" | "LEASE" | "ALL";
  segment?: "RESIDENTIAL" | "COMMERCIAL" | "ALL";
  signedIn: boolean;
  idleLabel?: string;
  activeLabel?: string;
  authCallbackUrl?: string;
  className?: string;
}) {
  const { openAuth } = useAuthModal();
  const { toast } = useSiteAlert();
  const [pending, setPending] = useState(false);
  const [monitorId, setMonitorId] = useState<string | null>(null);

  const canWatch = Boolean(city.trim());
  const watching = Boolean(monitorId);
  const normalizedCommunity = community?.trim() || null;
  const normalizedTxn =
    transactionType === "ALL" ? "ALL" : transactionType;
  const normalizedSegment = watchSegmentOf(segment);

  useEffect(() => {
    if (!signedIn || !canWatch) {
      setMonitorId(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/account/area-monitors");
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { items?: AreaMonitorRow[] };
      const match = (data.items ?? []).find((item) =>
        matchesMonitor(
          item,
          city.trim(),
          normalizedCommunity,
          normalizedTxn,
          normalizedSegment,
        ),
      );
      if (!cancelled) setMonitorId(match?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    signedIn,
    canWatch,
    city,
    normalizedCommunity,
    normalizedTxn,
    normalizedSegment,
  ]);

  async function toggle() {
    if (!signedIn) {
      openAuth({ mode: "sign-in", callbackUrl: authCallbackUrl });
      return;
    }
    if (!canWatch) return;

    if (watching) {
      setPending(true);
      const res = await fetch("/api/account/area-monitors", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          monitorId
            ? { id: monitorId }
            : {
                city: city.trim(),
                community: normalizedCommunity,
                transactionType: normalizedTxn,
                segment: normalizedSegment,
              },
        ),
      });
      setPending(false);
      if (!res.ok) {
        toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
        return;
      }
      setMonitorId(null);
      toast({ message: SITE_MESSAGES.areaRemovedToast, tone: "info" });
      return;
    }

    setPending(true);
    const res = await fetch("/api/account/area-monitors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        city: city.trim(),
        community: normalizedCommunity,
        transactionType: normalizedTxn,
        segment: normalizedSegment,
        notifyNew: true,
        notifySold: true,
      }),
    });
    setPending(false);
    if (!res.ok) {
      toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
      return;
    }
    const data = (await res.json()) as { item?: { id: string } };
    setMonitorId(data.item?.id ?? "watching");
    toast({ message: SITE_MESSAGES.areaWatchedToast, tone: "success" });
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={pending || !canWatch}
      onClick={() => void toggle()}
      className={cn(watching && "border-signal text-signal", className)}
      title={
        canWatch
          ? watching
            ? "Remove this area from your watchlist"
            : "Get alerts for new and sold listings in this area"
          : "Set a city first"
      }
    >
      <MapPin
        className={cn("h-4 w-4", watching && "fill-signal text-signal")}
      />
      {pending ? (watching ? "Removing…" : "Watching…") : watching ? activeLabel : idleLabel}
    </Button>
  );
}
