"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { X } from "lucide-react";
import { SHOW_AFTER_PX } from "@/hooks/use-scroll-fab-visible";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "houzzat:listing-detail-tips-v1";

type Step = "map" | "route" | "watchlist" | "notes";

type StoredTips = Partial<Record<Step, boolean>>;

type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const STEP_ORDER_MOBILE: Step[] = ["route", "map", "watchlist", "notes"];
const STEP_ORDER_DESKTOP: Step[] = ["route", "map"];

const COPY: Record<
  Step,
  { title: string; body: string; primary: string; secondary: string }
> = {
  map: {
    title: "See it on the map",
    body: "Open Map view to explore the pin, nearby solds, and what’s around this home.",
    primary: "Next",
    secondary: "Skip tips",
  },
  route: {
    title: "Build a viewing route",
    body: "Add homes to your Route Planner so you can tour several listings in one trip.",
    primary: "Next",
    secondary: "Skip tips",
  },
  watchlist: {
    title: "Watch for changes",
    body: "Tap Watchlist to get alerts when the price or status changes on this home.",
    primary: "Next",
    secondary: "Skip tips",
  },
  notes: {
    title: "Jot private notes",
    body: "After you scroll, this pen opens quick notes — handy for showings and offer ideas.",
    primary: "Got it",
    secondary: "Not now",
  },
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
    // Ignore quota / private mode.
  }
}

function isVisuallyPresent(el: HTMLElement) {
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (Number(style.opacity) < 0.2) return false;
  const r = el.getBoundingClientRect();
  return r.width >= 2 && r.height >= 2;
}

function findTarget(step: Step): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(
    `[data-houzzat-listing-coach="${step}"]`,
  );
  for (const el of nodes) {
    if (isVisuallyPresent(el)) return el;
  }
  return null;
}

function measure(el: HTMLElement | null): TargetRect | null {
  if (!el || !isVisuallyPresent(el)) return null;
  const r = el.getBoundingClientRect();
  return {
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
  };
}

function useIsMobileListing() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}

export function ListingDetailCoachMarks({
  enabled = true,
}: {
  enabled?: boolean;
}) {
  const isMobile = useIsMobileListing();
  const order = isMobile ? STEP_ORDER_MOBILE : STEP_ORDER_DESKTOP;

  const [hydrated, setHydrated] = useState(false);
  const [done, setDone] = useState<StoredTips>({});
  const [step, setStep] = useState<Step | null>(null);
  const [rect, setRect] = useState<TargetRect | null>(null);
  const [tipWidth, setTipWidth] = useState(300);
  const [notesReady, setNotesReady] = useState(false);

  useEffect(() => {
    setDone(readStored());
    setHydrated(true);
  }, []);

  // Start first unfinished tip shortly after landing.
  useEffect(() => {
    if (!hydrated || !enabled) return;
    const next = order.find((s) => !readStored()[s]);
    if (!next || next === "notes") return;
    const id = window.setTimeout(() => setStep(next), 800);
    return () => window.clearTimeout(id);
  }, [hydrated, enabled, order, isMobile]);

  // Notes tip: wait until user scrolls enough for the pen FAB, then delay.
  useEffect(() => {
    if (!hydrated || !enabled || !isMobile) return;
    if (done.notes) return;
    // Require map + route (+ watchlist if present) first.
    if (!done.map || !done.route) return;
    if (order.includes("watchlist") && !done.watchlist) return;

    function check() {
      if (window.scrollY > SHOW_AFTER_PX) setNotesReady(true);
    }
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, [hydrated, enabled, isMobile, done, order]);

  useEffect(() => {
    if (!notesReady || done.notes || step) return;
    if (!done.map || !done.route) return;
    if (order.includes("watchlist") && !done.watchlist) return;
    const id = window.setTimeout(() => setStep("notes"), 900);
    return () => window.clearTimeout(id);
  }, [notesReady, done, step, order]);

  const refreshRect = useCallback(() => {
    if (!step) {
      setRect(null);
      return;
    }
    setRect(measure(findTarget(step)));
    setTipWidth(Math.min(320, window.innerWidth - 24));
  }, [step]);

  useLayoutEffect(() => {
    if (!step) {
      setRect(null);
      return;
    }
    refreshRect();
    const raf = window.requestAnimationFrame(refreshRect);
    const interval = window.setInterval(refreshRect, 400);
    window.addEventListener("resize", refreshRect);
    window.addEventListener("scroll", refreshRect, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearInterval(interval);
      window.removeEventListener("resize", refreshRect);
      window.removeEventListener("scroll", refreshRect, true);
    };
  }, [step, refreshRect]);

  // If target missing (e.g. no map / inactive listing), skip ahead.
  useEffect(() => {
    if (!step || rect) return;
    const id = window.setTimeout(() => {
      if (measure(findTarget(step))) return;
      const stored = { ...readStored(), [step]: true };
      writeStored(stored);
      setDone(stored);
      const next = order.find((s) => !stored[s] && s !== "notes");
      setStep(next ?? null);
    }, 600);
    return () => window.clearTimeout(id);
  }, [step, rect, order]);

  function persist(partial: StoredTips) {
    const next = { ...readStored(), ...partial };
    writeStored(next);
    setDone(next);
  }

  function dismissAll() {
    const all = Object.fromEntries(order.map((s) => [s, true])) as StoredTips;
    persist(all);
    setStep(null);
  }

  function advance() {
    if (!step) return;
    persist({ [step]: true });
    const stored = { ...readStored(), [step]: true };
    const next = order.find((s) => !stored[s] && s !== "notes");
    if (next) {
      setStep(next);
      return;
    }
    setStep(null);
    // Notes waits for scroll; if already scrolled, notes effect will fire.
    if (window.scrollY > SHOW_AFTER_PX) setNotesReady(true);
  }

  if (!enabled || !step || !rect) return null;

  const copy = COPY[step];
  const pad = 6;
  const hole = {
    top: Math.max(8, rect.top - pad),
    left: Math.max(8, rect.left - pad),
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };

  const spaceBelow = window.innerHeight - (hole.top + hole.height);
  const placeBelow = spaceBelow > 170 || hole.top < 140;
  let tipLeft = hole.left + hole.width / 2 - tipWidth / 2;
  tipLeft = Math.min(Math.max(12, tipLeft), window.innerWidth - tipWidth - 12);
  const tipTop = placeBelow
    ? hole.top + hole.height + 12
    : Math.max(12, hole.top - 168);

  const total = order.length;
  const ordinal =
    step === "notes"
      ? total
      : Math.max(1, order.indexOf(step) + 1);

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
            {ordinal} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={dismissAll}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink/50 transition hover:text-ink"
            >
              {copy.secondary}
            </button>
            <button
              type="button"
              onClick={advance}
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
