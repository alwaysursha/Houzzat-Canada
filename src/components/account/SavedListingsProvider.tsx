"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

function normalizeMls(mlsNumber: string): string {
  return mlsNumber.trim().toUpperCase();
}

export function SavedListingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useSession();
  const [ready, setReady] = useState(false);
  const [savedMls, setSavedMls] = useState<Set<string>>(() => new Set());
  const reloadGenRef = useRef(0);

  const reload = useCallback(async () => {
    if (status !== "authenticated") {
      setSavedMls(new Set());
      setReady(status !== "loading");
      return;
    }

    const gen = ++reloadGenRef.current;
    try {
      const res = await fetch("/api/saved-listings", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (gen !== reloadGenRef.current) return;
      if (!res.ok) {
        setReady(true);
        return;
      }
      const data = (await res.json()) as { items?: { mlsNumber: string }[] };
      if (gen !== reloadGenRef.current) return;
      setSavedMls(
        new Set(
          (data.items ?? []).map((item) => normalizeMls(item.mlsNumber)),
        ),
      );
    } catch {
      // Leave previous set; page should still work if this fails.
    } finally {
      if (gen === reloadGenRef.current) {
        setReady(true);
      }
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
      isSaved: (mlsNumber: string) => savedMls.has(normalizeMls(mlsNumber)),
      setSavedState: (mlsNumber: string, saved: boolean) => {
        const key = normalizeMls(mlsNumber);
        setSavedMls((prev) => {
          const next = new Set(prev);
          if (saved) next.add(key);
          else next.delete(key);
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
