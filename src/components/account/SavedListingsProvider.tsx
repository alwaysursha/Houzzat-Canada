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
      const res = await fetch("/api/saved-listings");
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
    void reload();
  }, [reload]);

  useEffect(() => {
    function onChanged() {
      void reload();
    }
    window.addEventListener("houzzat:saved-listings-changed", onChanged);
    return () => {
      window.removeEventListener("houzzat:saved-listings-changed", onChanged);
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
