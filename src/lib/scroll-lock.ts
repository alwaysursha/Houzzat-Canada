/** Nested-safe body scroll lock for modals / sheets / alerts. */

let lockCount = 0;
let restorationBound = false;
/** Document scrollY captured on the first nested acquire; restored on last release. */
let lockedScrollY = 0;

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

function clearFixedBody() {
  if (typeof document === "undefined") return;
  const body = document.body;
  if (body.style.position === "fixed") {
    body.style.position = "";
  }
  if (body.style.top) body.style.top = "";
  if (body.style.left) body.style.left = "";
  if (body.style.right) body.style.right = "";
  if (body.style.width === "100%") body.style.width = "";
  if (body.style.overscrollBehaviorY === "none") {
    body.style.overscrollBehaviorY = "";
  }
}

function normalizeUnlockedOverflow() {
  if (typeof document === "undefined") return;
  if (lockCount > 0) return;
  clearInlineOverflow();
  clearFixedBody();
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
 * Nested-safe scroll lock. overflow + position:fixed are applied only on the
 * first acquire and cleared only when the last lock releases so stacked
 * Filters → confirmation / auth → qualification cannot wipe each other.
 * Scroll position is restored on the final release (iOS / Android touch-safe).
 */
export function acquireScrollLock(): () => void {
  if (typeof document === "undefined") return () => {};
  ensureRestorationListener();
  lockCount += 1;
  if (lockCount === 1) {
    lockedScrollY =
      typeof window !== "undefined"
        ? window.scrollY || window.pageYOffset || 0
        : 0;
    const body = document.body;
    body.style.overflow = "hidden";
    document.documentElement.style.overflowX = "hidden";
    body.style.overflowX = "hidden";
    // position:fixed stops touch rubber-band scroll on iOS / Android Chrome
    // where overflow:hidden alone still lets the listing page move.
    body.style.position = "fixed";
    body.style.top = `-${lockedScrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overscrollBehaviorY = "none";
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      clearInlineOverflow();
      clearFixedBody();
      if (typeof window !== "undefined") {
        window.scrollTo(0, lockedScrollY);
      }
      lockedScrollY = 0;
    }
  };
}

/** Test-only: reset nested lock count between selftests. */
export function __resetScrollLockForTests(): void {
  lockCount = 0;
  lockedScrollY = 0;
  if (typeof document !== "undefined") {
    clearInlineOverflow();
    clearFixedBody();
  }
}
