/** One-time post-verification UI signal (session-scoped only). */
export const VERIFICATION_SUCCESS_SESSION_KEY = "houzzat:verification-success";

export const EMAIL_VERIFIED_EVENT = "houzzat:email-verified";

/** Cached after first read so React strict-mode remounts still show once. */
let pendingShow: boolean | null = null;

export function stashVerificationSuccessSignal(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(VERIFICATION_SUCCESS_SESSION_KEY, "1");
    pendingShow = null;
  } catch {
    // ignore
  }
}

/** Read and consume the signal. Safe to call from client mount only. */
export function takeVerificationSuccessSignal(): boolean {
  if (typeof window === "undefined") return false;
  if (pendingShow !== null) return pendingShow;

  try {
    const value = sessionStorage.getItem(VERIFICATION_SUCCESS_SESSION_KEY);
    if (value !== "1") {
      pendingShow = false;
      return false;
    }
    sessionStorage.removeItem(VERIFICATION_SUCCESS_SESSION_KEY);
    pendingShow = true;
    return true;
  } catch {
    pendingShow = false;
    return false;
  }
}

export function dispatchEmailVerifiedRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EMAIL_VERIFIED_EVENT));
}
