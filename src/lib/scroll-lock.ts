/** Nested-safe body scroll lock for modals / sheets / alerts. */

let lockCount = 0;
let restorationBound = false;

export function hasActiveScrollLock(): boolean {
  return lockCount > 0;
}

function normalizeUnlockedOverflow() {
  if (typeof document === "undefined") return;
  if (lockCount > 0) return;
  if (document.body.style.overflow === "hidden") {
    document.body.style.overflow = "";
  }
  // SearchFiltersSheet (and similar) may also pin overflow-x while open.
  // Clear inline overflow-x when fully unlocked so bfcache/popstate cannot
  // leave the document horizontally locked after Filters closes.
  if (document.body.style.overflowX === "hidden") {
    document.body.style.overflowX = "";
  }
  if (document.documentElement.style.overflowX === "hidden") {
    document.documentElement.style.overflowX = "";
  }
}

function ensureRestorationListener() {
  if (typeof window === "undefined" || restorationBound) return;
  restorationBound = true;
  window.addEventListener("pageshow", () => {
    normalizeUnlockedOverflow();
  });
  window.addEventListener("popstate", () => {
    queueMicrotask(normalizeUnlockedOverflow);
  });
}

if (typeof window !== "undefined") {
  ensureRestorationListener();
}

export function acquireScrollLock(): () => void {
  if (typeof document === "undefined") return () => {};
  ensureRestorationListener();
  lockCount += 1;
  if (lockCount === 1) {
    document.body.style.overflow = "hidden";
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.body.style.overflow = "";
    }
  };
}
