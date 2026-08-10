/** Nested-safe body scroll lock for modals / sheets / alerts. */

let lockCount = 0;

export function acquireScrollLock(): () => void {
  if (typeof document === "undefined") return () => {};
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
