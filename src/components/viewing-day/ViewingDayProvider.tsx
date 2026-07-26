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
  clearLocalViewingDay,
  loadLocalViewingDay,
  saveLocalViewingDay,
  toggleLocalStop,
} from "@/lib/viewing-day/local";
import { VIEWING_DAY_MAX_STOPS } from "@/lib/viewing-day/optimize";

export type ViewingDayStopSummary = {
  mlsNumber: string;
};

type ViewingDayContextValue = {
  ready: boolean;
  count: number;
  isOnTour: (mlsNumber: string) => boolean;
  toggleStop: (
    mlsNumber: string,
  ) => Promise<{ ok: boolean; added?: boolean; error?: string }>;
  refresh: () => Promise<void>;
  mergeLocalAfterSignIn: () => Promise<void>;
};

const ViewingDayContext = createContext<ViewingDayContextValue | null>(null);

export function ViewingDayProvider({
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
      const local = loadLocalViewingDay();
      setMlsSet(new Set(local.mlsNumbers));
      setReady(true);
      return;
    }

    try {
      const res = await fetch("/api/viewing-day");
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
    const local = loadLocalViewingDay();
    if (local.mlsNumbers.length === 0 && !local.startAddress && !local.startAt) {
      return;
    }
    try {
      await fetch("/api/viewing-day", {
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
      clearLocalViewingDay();
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
    window.addEventListener("houzzat:viewing-day-changed", onChanged);
    return () =>
      window.removeEventListener("houzzat:viewing-day-changed", onChanged);
  }, [refresh]);

  const toggleStop = useCallback(
    async (mlsNumber: string) => {
      if (status !== "authenticated") {
        const result = toggleLocalStop(mlsNumber, VIEWING_DAY_MAX_STOPS);
        if (!result.ok) {
          return {
            ok: false,
            error: `Afternoon tours work best under ${VIEWING_DAY_MAX_STOPS} homes.`,
          };
        }
        setMlsSet(new Set(result.day.mlsNumbers));
        return { ok: true, added: result.added };
      }

      const onTour = mlsSet.has(mlsNumber);
      const res = await fetch("/api/viewing-day/stops", {
        method: onTour ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mlsNumber }),
      });
      const data = (await res.json()) as {
        error?: string;
        tour?: { stops?: { mlsNumber: string }[] };
        added?: boolean;
      };
      if (!res.ok) {
        return { ok: false, error: data.error ?? "Could not update Viewing day." };
      }
      setMlsSet(new Set((data.tour?.stops ?? []).map((s) => s.mlsNumber)));
      window.dispatchEvent(new Event("houzzat:viewing-day-changed"));
      return { ok: true, added: !onTour };
    },
    [status, mlsSet],
  );

  const value = useMemo<ViewingDayContextValue>(
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
    <ViewingDayContext.Provider value={value}>
      {children}
    </ViewingDayContext.Provider>
  );
}

export function useViewingDay() {
  return useContext(ViewingDayContext);
}

/** Keep local start fields in sync when guest edits tour page. */
export function patchLocalViewingDayStart(input: {
  startAddress?: string | null;
  startLat?: number | null;
  startLng?: number | null;
  startAt?: string | null;
  defaultDwellMinutes?: number;
  bufferMinutes?: number;
  mlsNumbers?: string[];
}) {
  const day = loadLocalViewingDay();
  saveLocalViewingDay({
    ...day,
    ...input,
    mlsNumbers: input.mlsNumbers ?? day.mlsNumbers,
  });
}
