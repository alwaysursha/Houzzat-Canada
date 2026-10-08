/** Nested-safe body scroll lock for modals / sheets / alerts. */

let lockCount = 0;
let restorationBound = false;

export function hasActiveScrollLock(): boolean {
  return lockCount > 0;
}

function clearInlineOverflow() {
  if (typeof document === "undefined") return;
  if (document.body.style.overflow === "hidden") {
    document.body.style.overflow = "";
  }
  if (document.body.style.overflowX === "hidden") {
    document.body.style.overflowX = "";
  }
  if (document.documentElement.style.overflowX === "hidden") {
    document.documentElement.style.overflowX = "";
  }
}

function normalizeUnlockedOverflow() {
  if (typeof document === "undefined") return;
  if (lockCount > 0) return;
  clearInlineOverflow();
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

/**
 * Nested-safe scroll lock. overflow + overflow-x are applied only on the
 * first acquire and cleared only when the last lock releases so stacked
 * Filters → confirmation transitions cannot wipe each other's overflow-x.
 */
export function acquireScrollLock(): () => void {
  if (typeof document === "undefined") return () => {};
  ensureRestorationListener();
  lockCount += 1;
  if (lockCount === 1) {
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflowX = "hidden";
    document.body.style.overflowX = "hidden";
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      clearInlineOverflow();
    }
  };
}

/** Test-only: reset nested lock count between selftests. */
export function __resetScrollLockForTests(): void {
  lockCount = 0;
  if (typeof document !== "undefined") {
    clearInlineOverflow();
  }
}
