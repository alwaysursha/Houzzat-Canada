/**
 * GA4 funnel helpers for consumer lead capture.
 * Signup conversion remains reportGa4SignUp — fire once at capture only.
 */

type GtagFn = (...args: unknown[]) => void;

function installedGtag(): GtagFn | undefined {
  if (typeof window === "undefined") return undefined;
  const gtag = (window as Window & { gtag?: unknown }).gtag;
  return typeof gtag === "function" ? (gtag as GtagFn) : undefined;
}

function fire(name: string, params?: Record<string, unknown>): void {
  try {
    installedGtag()?.("event", name, params ?? {});
  } catch {
    /* never break UX */
  }
}

export function reportLeadCaptureStarted(): void {
  fire("lead_capture_started");
}

export function reportLeadCaptured(): void {
  fire("lead_captured");
}

export function reportPhoneVerificationSent(): void {
  fire("phone_verification_sent");
}

export function reportPhoneVerified(): void {
  fire("phone_verified");
}

export function reportPhoneVerificationSkipped(): void {
  fire("phone_verification_skipped");
}

export function reportQualificationCompleted(): void {
  fire("qualification_completed");
}

export function reportTourPromptShown(): void {
  fire("tour_prompt_shown");
}
