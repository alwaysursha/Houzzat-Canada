/**
 * Exact Phase-0 production gates, extracted for equivalence tests.
 * Do not change these to match the new resolver — the resolver must match them.
 */

export function legacyWatchEmailEligible(input: {
  email?: string | null;
  emailAlertsEnabled: boolean;
  monitorEmailAlerts: boolean;
}): boolean {
  return (
    Boolean(input.email) &&
    input.emailAlertsEnabled &&
    input.monitorEmailAlerts
  );
}

export function legacyBuyerDigestUserEligible(input: {
  isBuyer: boolean;
  emailAlertsEnabled: boolean;
  disabledAt: Date | null;
  email: string;
}): boolean {
  return (
    input.isBuyer &&
    input.emailAlertsEnabled &&
    input.disabledAt === null &&
    Boolean(input.email)
  );
}

export function legacyBuyerDigestPrimaryEligible(input: {
  primaryEmailAlerts: boolean | null;
}): boolean {
  if (input.primaryEmailAlerts === null) return true;
  return input.primaryEmailAlerts;
}

export function legacyCrmEmailEligible(input: {
  contactConsentAt: Date | null;
  caslConsentAt: Date | null;
  emailAlertsEnabled: boolean | undefined;
}): boolean {
  const consented =
    Boolean(input.contactConsentAt) || Boolean(input.caslConsentAt);
  return consented && input.emailAlertsEnabled !== false;
}
