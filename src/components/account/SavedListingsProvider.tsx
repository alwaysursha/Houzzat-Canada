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
  isSavedListingsChangedMessage,
  isSavedListingsRevStorageKey,
  SAVED_LISTINGS_CHANGED_EVENT,
} from "@/lib/account/saved-listings-sync";
import { scheduleAfterFirstPaint } from "@/lib/mobile/schedule-idle";

type SavedListingsContextValue = {
  ready: boolean;
  isSaved: (mlsNumber: string) => boolean;
  setSavedState: (mlsNumber: string, saved: boolean) => void;
};

const SavedListingsContext = createContext<SavedListingsContextValue | null>(
  null,
);

export function SavedListingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useSession();
  const [ready, setReady] = useState(false);
  const [savedMls, setSavedMls] = useState<Set<string>>(() => new Set());

  const reload = useCallback(async () => {
    if (status !== "authenticated") {
      setSavedMls(new Set());
      setReady(status !== "loading");
      return;
    }

    try {
      const res = await fetch("/api/saved-listings", {
        credentials: "same-origin",
      });
      if (!res.ok) {
        setReady(true);
        return;
      }
      const data = (await res.json()) as { items?: { mlsNumber: string }[] };
      setSavedMls(new Set((data.items ?? []).map((item) => item.mlsNumber)));
    } catch {
      // Leave previous set; page should still work if this fails.
    } finally {
      setReady(true);
    }
  }, [status]);

  useEffect(() => {
    // Guest resolution is sync/cheap; authenticated fetch waits for first paint.
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
      if (isSavedListingsRevStorageKey(event.key)) onChanged();
    }
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!isSavedListingsChangedMessage(event.data)) return;
      onChanged();
    }
    window.addEventListener(SAVED_LISTINGS_CHANGED_EVENT, onChanged);
    window.addEventListener("storage", onStorage);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener(SAVED_LISTINGS_CHANGED_EVENT, onChanged);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("message", onMessage);
    };
  }, [reload]);

  const value = useMemo<SavedListingsContextValue>(
    () => ({
      ready,
      isSaved: (mlsNumber: string) => savedMls.has(mlsNumber),
      setSavedState: (mlsNumber: string, saved: boolean) => {
        setSavedMls((prev) => {
          const next = new Set(prev);
          if (saved) next.add(mlsNumber);
          else next.delete(mlsNumber);
          return next;
        });
      },
    }),
    [ready, savedMls],
  );

  return (
    <SavedListingsContext.Provider value={value}>
      {children}
    </SavedListingsContext.Provider>
  );
}

export function useSavedListingsStatus() {
  return useContext(SavedListingsContext);
}
