/**
 * Run work after the browser is idle (or after a short fallback delay).
 * Always respects `timeoutMs` so secondary Home work still starts promptly.
 */
export function scheduleIdle(
  work: () => void,
  options?: { timeoutMs?: number },
): () => void {
  const timeoutMs = options?.timeoutMs ?? 1_800;

  if (typeof window === "undefined") {
    return () => undefined;
  }

  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(() => work(), { timeout: timeoutMs });
    return () => window.cancelIdleCallback(id);
  }

  const id = window.setTimeout(work, Math.min(timeoutMs, 200));
  return () => window.clearTimeout(id);
}

/** First paint, then idle — keeps the hero free of secondary Home work. */
export function scheduleAfterFirstPaint(
  work: () => void,
  options?: { timeoutMs?: number },
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  let cancelIdle: (() => void) | undefined;
  const raf = window.requestAnimationFrame(() => {
    cancelIdle = scheduleIdle(work, options);
  });

  return () => {
    window.cancelAnimationFrame(raf);
    cancelIdle?.();
  };
}
