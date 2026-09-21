"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DebouncedDraftSaver,
  ONBOARDING_DRAFT_DEBOUNCE_MS,
  type DraftSaveStatus,
} from "@/lib/onboarding/draft-autosave";

type FlushFn = () => Promise<void>;

type OnboardingDraftFlushValue = {
  register: (id: string, flush: FlushFn) => () => void;
  flushAll: () => Promise<void>;
};

const OnboardingDraftFlushContext =
  createContext<OnboardingDraftFlushValue | null>(null);

export function OnboardingDraftFlushProvider({
  children,
}: {
  children: ReactNode;
}) {
  const flushes = useRef(new Map<string, FlushFn>());

  const register = useCallback((id: string, flush: FlushFn) => {
    flushes.current.set(id, flush);
    return () => {
      if (flushes.current.get(id) === flush) {
        flushes.current.delete(id);
      }
    };
  }, []);

  const flushAll = useCallback(async () => {
    const pending = [...flushes.current.values()].map((flush) => flush());
    await Promise.all(pending);
  }, []);

  const value = useMemo(
    () => ({ register, flushAll }),
    [register, flushAll],
  );

  return (
    <OnboardingDraftFlushContext.Provider value={value}>
      {children}
    </OnboardingDraftFlushContext.Provider>
  );
}

export function useOnboardingDraftFlush(): OnboardingDraftFlushValue {
  return (
    useContext(OnboardingDraftFlushContext) ?? {
      register: () => () => {},
      flushAll: async () => {},
    }
  );
}

export function useOnboardingDraftAutosave<T>(options: {
  save: (value: T) => Promise<void>;
  debounceMs?: number;
  flushId?: string;
}): {
  status: DraftSaveStatus;
  schedule: (value: T) => void;
  flush: () => Promise<void>;
  hasUnsavedWork: () => boolean;
} {
  const { save, debounceMs = ONBOARDING_DRAFT_DEBOUNCE_MS, flushId } = options;
  const saveRef = useRef(save);
  saveRef.current = save;
  const [status, setStatus] = useState<DraftSaveStatus>("idle");
  const saver = useMemo(
    () =>
      new DebouncedDraftSaver<T>({
        debounceMs,
        save: (value) => saveRef.current(value),
        onStatus: setStatus,
      }),
    [debounceMs],
  );

  useEffect(() => () => saver.dispose(), [saver]);

  const { register } = useOnboardingDraftFlush();
  const flush = useCallback(() => saver.flush(), [saver]);

  useEffect(() => {
    if (!flushId) return;
    return register(flushId, flush);
  }, [flush, flushId, register]);

  return {
    status,
    schedule: (value: T) => saver.schedule(value),
    flush,
    hasUnsavedWork: () => saver.hasUnsavedWork(),
  };
}

export function OnboardingDraftStatus({
  status,
}: {
  status: DraftSaveStatus;
}) {
  if (status === "idle") return null;
  const label =
    status === "saving"
      ? "Saving..."
      : status === "saved"
        ? "Saved"
        : "Couldn't save";
  const className =
    status === "error"
      ? "text-xs font-medium text-red-700"
      : status === "saved"
        ? "text-xs font-medium text-emerald-700"
        : "text-xs font-medium text-slate-500";
  return (
    <p className={className} aria-live="polite">
      {label}
    </p>
  );
}
