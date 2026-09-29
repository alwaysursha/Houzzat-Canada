type GtagFn = (...args: unknown[]) => void;

function installedGtag(): GtagFn | undefined {
  if (typeof window === "undefined") return undefined;
  const gtag = (window as Window & { gtag?: unknown }).gtag;
  return typeof gtag === "function" ? (gtag as GtagFn) : undefined;
}

/**
 * GA4 recommended sign_up. Fires only when the caller already knows the
 * account was created. Missing or broken gtag must not affect signup.
 */
export function reportGa4SignUp(gtag: GtagFn | undefined = installedGtag()): void {
  try {
    gtag?.("event", "sign_up", { method: "email" });
  } catch {
    return;
  }
}
