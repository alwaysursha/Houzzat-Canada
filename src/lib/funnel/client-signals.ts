/**
 * Pure helpers for Phase 2B client funnel signals (testable without DOM).
 */

/** ListingLink primary-click plan — navigation must stay independent of analytics. */
export function resolveListingLinkClickAction(input: {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  button: number;
  defaultPrevented: boolean;
}): { trackCardClick: boolean; openOverlay: boolean } {
  if (
    input.metaKey ||
    input.ctrlKey ||
    input.shiftKey ||
    input.altKey ||
    input.button !== 0
  ) {
    return { trackCardClick: false, openOverlay: false };
  }
  return {
    trackCardClick: true,
    openOverlay: !input.defaultPrevented,
  };
}

/** registration_gate_shown — once per MLS while the gate is actually presented. */
export function shouldReportRegistrationGateShown(input: {
  blocked: boolean;
  normalizedMls: string | null;
  alreadyPresentedMls: string | null;
}): boolean {
  if (!input.blocked || !input.normalizedMls) return false;
  return input.alreadyPresentedMls !== input.normalizedMls;
}

/** registration_started — meaningful interaction, not modal open. */
export function shouldReportRegistrationStarted(input: {
  alreadyStarted: boolean;
  fieldValue?: string | null;
  isSubmit?: boolean;
}): boolean {
  if (input.alreadyStarted) return false;
  if (input.isSubmit) return true;
  return Boolean(input.fieldValue?.trim());
}
