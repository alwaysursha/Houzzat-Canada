"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type RefObject,
} from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "houzzat:map-search-tips-v1";

type StoredTips = {
  views?: boolean;
  save?: boolean;
};

type Step = "views" | "save";

type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function readStored(): StoredTips {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredTips;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStored(next: StoredTips) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / private mode failures.
  }
}

function measure(el: HTMLElement | null): TargetRect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  return {
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
  };
}

const COPY: Record<
  Step,
  { title: string; body: string; primary: string; secondary: string }
> = {
  views: {
    title: "Switch how you browse",
    body: "Map for exploring · Split for map + list · Cards for scrolling homes.",
    primary: "Next",
    secondary: "Skip tips",
  },
  save: {
    title: "Get alerts for new homes",
    body: "When you change filters, Saved Search lights up so you can store the latest criteria for alerts.",
    primary: "Got it",
    secondary: "Not now",
  },
};

export function MapSearchCoachMarks({
  enabled,
  viewToggleRef,
  saveSearchRef,
  mapMoved,
  filterIntentKey,
}: {
  enabled: boolean;
  viewToggleRef: RefObject<HTMLElement | null>;
  saveSearchRef: RefObject<HTMLElement | null>;
  /** True after the user pans/zooms the map at least once. */
  mapMoved: boolean;
  /** Changes when filters change — counts as intent for the save tip. */
  filterIntentKey: string;
}) {
  const [step, setStep] = useState<Step | null>(null);
  const [rect, setRect] = useState<TargetRect | null>(null);
  const [viewsDone, setViewsDone] = useState(true);
  const [saveDone, setSaveDone] = useState(true);
  const [saveReady, setSaveReady] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [initialFilterKey] = useState(filterIntentKey);
  const [tipWidth, setTipWidth] = useState(300);

  useEffect(() => {
    const stored = readStored();
    setViewsDone(Boolean(stored.views));
    setSaveDone(Boolean(stored.save));
    setHydrated(true);
  }, []);

  // Step 1: short delay after landing on map view.
  useEffect(() => {
    if (!hydrated || !enabled || viewsDone) return;
    const id = window.setTimeout(() => setStep("views"), 700);
    return () => window.clearTimeout(id);
  }, [hydrated, enabled, viewsDone]);

  // Intent for step 2: pan/zoom, dwell, or filter change after step 1.
  useEffect(() => {
    if (!hydrated || !enabled || !viewsDone || saveDone || saveReady) return;

    const filterChanged = filterIntentKey !== initialFilterKey;
    if (mapMoved || filterChanged) {
      setSaveReady(true);
      return;
    }

    const id = window.setTimeout(() => setSaveReady(true), 18_000);
    return () => window.clearTimeout(id);
  }, [
    hydrated,
    enabled,
    viewsDone,
    saveDone,
    saveReady,
    mapMoved,
    filterIntentKey,
    initialFilterKey,
  ]);

  useEffect(() => {
    if (!hydrated || !enabled || !viewsDone || saveDone || !saveReady) return;
    if (step === "views") return;
    const id = window.setTimeout(() => setStep("save"), 400);
    return () => window.clearTimeout(id);
  }, [hydrated, enabled, viewsDone, saveDone, saveReady, step]);

  // Leave map view → hide tip (progress kept).
  useEffect(() => {
    if (!enabled) setStep(null);
  }, [enabled]);

  const refreshRect = useCallback(() => {
    const el =
      step === "views"
        ? viewToggleRef.current
        : step === "save"
          ? saveSearchRef.current
          : null;
    setRect(measure(el));
    setTipWidth(Math.min(320, window.innerWidth - 24));
  }, [step, viewToggleRef, saveSearchRef]);

  useLayoutEffect(() => {
    if (!step) {
      setRect(null);
      return;
    }
    refreshRect();
    // Re-measure after layout settles (filters wrapping, fonts).
    const raf = window.requestAnimationFrame(refreshRect);
    window.addEventListener("resize", refreshRect);
    window.addEventListener("scroll", refreshRect, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", refreshRect);
      window.removeEventListener("scroll", refreshRect, true);
    };
  }, [step, refreshRect]);

  function persist(partial: StoredTips) {
    const next = { ...readStored(), ...partial };
    writeStored(next);
    if (partial.views) setViewsDone(true);
    if (partial.save) setSaveDone(true);
  }

  function dismissAll() {
    persist({ views: true, save: true });
    setStep(null);
  }

  function advanceFromViews() {
    persist({ views: true });
    setStep(null);
  }

  function finishSave() {
    persist({ save: true });
    setStep(null);
  }

  if (!step || !rect) return null;

  const copy = COPY[step];
  const pad = 6;
  const hole = {
    top: Math.max(8, rect.top - pad),
    left: Math.max(8, rect.left - pad),
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };

  const spaceBelow = window.innerHeight - (hole.top + hole.height);
  const placeBelow = spaceBelow > 160 || hole.top < 140;
  let tipLeft = hole.left + hole.width / 2 - tipWidth / 2;
  tipLeft = Math.min(Math.max(12, tipLeft), window.innerWidth - tipWidth - 12);
  const tipTop = placeBelow
    ? hole.top + hole.height + 12
    : Math.max(12, hole.top - 162);

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]" aria-live="polite">
      <div
        className={cn(
          "absolute rounded-2xl ring-2 ring-canopy/80 houzzat-coach-pulse",
        )}
        style={{
          top: hole.top,
          left: hole.left,
          width: hole.width,
          height: hole.height,
          boxShadow: "0 0 0 9999px rgb(15 23 20 / 0.45)",
        }}
      />

      <div
        role="dialog"
        aria-label={copy.title}
        className="pointer-events-auto absolute rounded-2xl border border-line bg-surface p-4 shadow-xl"
        style={{ top: tipTop, left: tipLeft, width: tipWidth }}
      >
        <div className="mb-1 flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-ink">{copy.title}</p>
          <button
            type="button"
            aria-label="Dismiss tips"
            onClick={dismissAll}
            className="rounded-md p-0.5 text-ink/40 transition hover:bg-mist hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <p className="text-sm leading-relaxed text-ink/65">{copy.body}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-ink/35">
            {step === "views" ? "1 of 2" : "2 of 2"}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                step === "views" ? dismissAll() : finishSave()
              }
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink/50 transition hover:text-ink"
            >
              {copy.secondary}
            </button>
            <button
              type="button"
              onClick={() =>
                step === "views" ? advanceFromViews() : finishSave()
              }
              className="rounded-lg bg-canopy px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-canopy-deep"
            >
              {copy.primary}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
