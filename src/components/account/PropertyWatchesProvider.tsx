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
  isPropertyWatchesChangedMessage,
  isPropertyWatchesRevStorageKey,
  PROPERTY_WATCHES_CHANGED_EVENT,
} from "@/lib/account/watch-sync";
import { scheduleAfterFirstPaint } from "@/lib/mobile/schedule-idle";

type PropertyWatchesContextValue = {
  ready: boolean;
  isWatching: (mlsNumber: string) => boolean;
  setWatchingState: (mlsNumber: string, watching: boolean) => void;
};

const PropertyWatchesContext =
  createContext<PropertyWatchesContextValue | null>(null);

export function PropertyWatchesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useSession();
  const [ready, setReady] = useState(false);
  const [watchingMls, setWatchingMls] = useState<Set<string>>(
    () => new Set(),
  );

  const reload = useCallback(async () => {
    if (status !== "authenticated") {
      setWatchingMls(new Set());
      setReady(status !== "loading");
      return;
    }

    try {
      const res = await fetch("/api/account/property-monitors", {
        credentials: "same-origin",
      });
      if (!res.ok) {
        setReady(true);
        return;
      }
      const data = (await res.json()) as { items?: { mlsNumber: string }[] };
      setWatchingMls(
        new Set((data.items ?? []).map((item) => item.mlsNumber)),
      );
    } catch {
      // keep previous set
    } finally {
      setReady(true);
    }
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated") {
      void reload();
      return;
    }
    return scheduleAfterFirstPaint(
      () => {
        void reload();
      },
      { timeoutMs: 1_800 },
    );
  }, [reload, status]);

  useEffect(() => {
    function onChanged() {
      void reload();
    }
    function onStorage(event: StorageEvent) {
      if (isPropertyWatchesRevStorageKey(event.key)) onChanged();
    }
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!isPropertyWatchesChangedMessage(event.data)) return;
      onChanged();
    }
    window.addEventListener(PROPERTY_WATCHES_CHANGED_EVENT, onChanged);
    window.addEventListener("storage", onStorage);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener(PROPERTY_WATCHES_CHANGED_EVENT, onChanged);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("message", onMessage);
    };
  }, [reload]);

  const value = useMemo<PropertyWatchesContextValue>(
    () => ({
      ready,
      isWatching: (mlsNumber: string) => watchingMls.has(mlsNumber),
      setWatchingState: (mlsNumber: string, watching: boolean) => {
        setWatchingMls((prev) => {
          const next = new Set(prev);
          if (watching) next.add(mlsNumber);
          else next.delete(mlsNumber);
          return next;
        });
      },
    }),
    [ready, watchingMls],
  );

  return (
    <PropertyWatchesContext.Provider value={value}>
      {children}
    </PropertyWatchesContext.Provider>
  );
}

export function usePropertyWatchesStatus() {
  return useContext(PropertyWatchesContext);
}
