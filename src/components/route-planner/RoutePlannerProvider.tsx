"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSession } from "next-auth/react";
import {
  clearLocalRoutePlanner,
  loadLocalRoutePlanner,
  saveLocalRoutePlanner,
  toggleLocalStop,
} from "@/lib/route-planner/local";
import { ROUTE_PLANNER_MAX_STOPS } from "@/lib/route-planner/optimize";

export type RoutePlannerStopSummary = {
  mlsNumber: string;
};

type RoutePlannerContextValue = {
  ready: boolean;
  count: number;
  isOnTour: (mlsNumber: string) => boolean;
  toggleStop: (
    mlsNumber: string,
  ) => Promise<{ ok: boolean; added?: boolean; error?: string }>;
  refresh: () => Promise<void>;
  mergeLocalAfterSignIn: () => Promise<void>;
};

const RoutePlannerContext = createContext<RoutePlannerContextValue | null>(null);

export function RoutePlannerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useSession();
  const [ready, setReady] = useState(false);
  const [mlsSet, setMlsSet] = useState<Set<string>>(() => new Set());

  const refresh = useCallback(async () => {
    if (status === "loading") return;

    if (status !== "authenticated") {
      const local = loadLocalRoutePlanner();
      setMlsSet(new Set(local.mlsNumbers));
      setReady(true);
      return;
    }

    try {
      const res = await fetch("/api/route-planner");
      if (!res.ok) {
        setReady(true);
        return;
      }
      const data = (await res.json()) as {
        tour?: { stops?: { mlsNumber: string }[] };
      };
      setMlsSet(new Set((data.tour?.stops ?? []).map((s) => s.mlsNumber)));
    } catch {
      // keep prior
    } finally {
      setReady(true);
    }
  }, [status]);

  const mergeLocalAfterSignIn = useCallback(async () => {
    if (status !== "authenticated") return;
    const local = loadLocalRoutePlanner();
    if (local.mlsNumbers.length === 0 && !local.startAddress && !local.startAt) {
      return;
    }
    try {
      await fetch("/api/route-planner", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mergeMlsNumbers: local.mlsNumbers,
          startAddress: local.startAddress ?? undefined,
          startLat: local.startLat ?? undefined,
          startLng: local.startLng ?? undefined,
          startAt: local.startAt ?? undefined,
          defaultDwellMinutes: local.defaultDwellMinutes,
          bufferMinutes: local.bufferMinutes,
        }),
      });
      clearLocalRoutePlanner();
      await refresh();
    } catch {
      // ignore merge failure
    }
  }, [status, refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (status === "authenticated") {
      void mergeLocalAfterSignIn();
    }
  }, [status, mergeLocalAfterSignIn]);

  useEffect(() => {
    function onChanged() {
      void refresh();
    }
    window.addEventListener("houzzat:route-planner-changed", onChanged);
    return () =>
      window.removeEventListener("houzzat:route-planner-changed", onChanged);
  }, [refresh]);

  const toggleStop = useCallback(
    async (mlsNumber: string) => {
      if (status !== "authenticated") {
        const result = toggleLocalStop(mlsNumber, ROUTE_PLANNER_MAX_STOPS);
        if (!result.ok) {
          return {
            ok: false,
            error: `Routes work best under ${ROUTE_PLANNER_MAX_STOPS} homes.`,
          };
        }
        setMlsSet(new Set(result.day.mlsNumbers));
        return { ok: true, added: result.added };
      }

      const onTour = mlsSet.has(mlsNumber);
      const res = await fetch("/api/route-planner/stops", {
        method: onTour ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mlsNumber }),
      });
      let data: {
        error?: string;
        tour?: { stops?: { mlsNumber: string }[] };
        added?: boolean;
      } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        return {
          ok: false,
          error: "Could not update Route Planner. Please try again.",
        };
      }
      if (!res.ok) {
        return {
          ok: false,
          error: data.error ?? "Could not update Route Planner.",
        };
      }
      setMlsSet(new Set((data.tour?.stops ?? []).map((s) => s.mlsNumber)));
      window.dispatchEvent(new Event("houzzat:route-planner-changed"));
      return { ok: true, added: !onTour };
    },
    [status, mlsSet],
  );

  const value = useMemo<RoutePlannerContextValue>(
    () => ({
      ready,
      count: mlsSet.size,
      isOnTour: (mlsNumber: string) => mlsSet.has(mlsNumber),
      toggleStop,
      refresh,
      mergeLocalAfterSignIn,
    }),
    [ready, mlsSet, toggleStop, refresh, mergeLocalAfterSignIn],
  );

  return (
    <RoutePlannerContext.Provider value={value}>
      {children}
    </RoutePlannerContext.Provider>
  );
}

export function useRoutePlanner() {
  return useContext(RoutePlannerContext);
}

/** Keep local start fields in sync when guest edits tour page. */
export function patchLocalRoutePlannerStart(input: {
  startAddress?: string | null;
  startLat?: number | null;
  startLng?: number | null;
  startAt?: string | null;
  defaultDwellMinutes?: number;
  bufferMinutes?: number;
  mlsNumbers?: string[];
}) {
  const day = loadLocalRoutePlanner();
  saveLocalRoutePlanner({
    ...day,
    ...input,
    mlsNumbers: input.mlsNumbers ?? day.mlsNumbers,
  });
}
