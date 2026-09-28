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
import { mergeGuestRoutePlanner } from "@/lib/route-planner/merge-guest";
import { ROUTE_PLANNER_MAX_STOPS } from "@/lib/route-planner/optimize";
import {
  isRoutePlannerChangedMessage,
  isRoutePlannerRevStorageKey,
  notifyRoutePlannerChanged,
  ROUTE_PLANNER_CHANGED_EVENT,
} from "@/lib/route-planner/route-planner-sync";
import { customerAccessDenialFromBody } from "@/lib/account/customer-access-error";
import { scheduleAfterFirstPaint } from "@/lib/mobile/schedule-idle";

export type RoutePlannerStopSummary = {
  mlsNumber: string;
};

type RoutePlannerContextValue = {
  ready: boolean;
  count: number;
  isOnTour: (mlsNumber: string) => boolean;
  toggleStop: (
    mlsNumber: string,
  ) => Promise<{
    ok: boolean;
    added?: boolean;
    error?: string;
    requiresEmailVerification?: boolean;
  }>;
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
    await mergeGuestRoutePlanner({
      load: loadLocalRoutePlanner,
      patch: async (body) => {
        const res = await fetch("/api/route-planner", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return { ok: res.ok };
      },
      refresh,
      clear: clearLocalRoutePlanner,
    });
  }, [status, refresh]);

  useEffect(() => {
    if (status === "loading") return;
    // Local guest state is sync; authenticated network refresh is secondary.
    if (status !== "authenticated") {
      void refresh();
      return;
    }
    return scheduleAfterFirstPaint(
      () => {
        void refresh();
      },
      { timeoutMs: 2_000 },
    );
  }, [refresh, status]);

  useEffect(() => {
    if (status === "authenticated") {
      void mergeLocalAfterSignIn();
    }
  }, [status, mergeLocalAfterSignIn]);

  useEffect(() => {
    function onChanged() {
      void refresh();
    }
    function onStorage(event: StorageEvent) {
      if (isRoutePlannerRevStorageKey(event.key)) onChanged();
    }
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!isRoutePlannerChangedMessage(event.data)) return;
      onChanged();
    }
    window.addEventListener(ROUTE_PLANNER_CHANGED_EVENT, onChanged);
    window.addEventListener("storage", onStorage);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener(ROUTE_PLANNER_CHANGED_EVENT, onChanged);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("message", onMessage);
    };
  }, [refresh]);

  const toggleStop = useCallback(
    async (mlsNumber: string) => {
      try {
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
          requiresEmailVerification?: boolean;
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
          const denial = customerAccessDenialFromBody(res.status, data);
          return {
            ok: false,
            error: data.error ?? "Could not update Route Planner.",
            requiresEmailVerification:
              denial.requiresEmailVerification || res.status === 403,
          };
        }
        setMlsSet(new Set((data.tour?.stops ?? []).map((s) => s.mlsNumber)));
        notifyRoutePlannerChanged();
        return { ok: true, added: !onTour };
      } catch {
        return {
          ok: false,
          error: "Could not update Route Planner. Please try again.",
        };
      }
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
