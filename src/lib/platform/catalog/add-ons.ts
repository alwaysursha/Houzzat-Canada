/**
 * Stage 6.7A — locked commercial add-on pricing authority.
 * Plan base prices stay in plans.ts; add-on unit prices live here.
 */

/** Additional Agent — TEAM / BROKERAGE only. */
export const ADDITIONAL_AGENT_MONTHLY_CENTS = 8_900; // $89 CAD / month
export const ADDITIONAL_AGENT_ANNUAL_CENTS = 89_900; // $899 CAD / year

/**
 * Unit commercial price for one additional agent seat,
 * selected by the offer billing cadence.
 */
export function getAdditionalAgentUnitCents(
  billingCadence: "MONTHLY" | "ANNUAL",
): number {
  return billingCadence === "ANNUAL"
    ? ADDITIONAL_AGENT_ANNUAL_CENTS
    : ADDITIONAL_AGENT_MONTHLY_CENTS;
}

export function additionalAgentUnitLabel(
  billingCadence: "MONTHLY" | "ANNUAL",
): string {
  return billingCadence === "ANNUAL" ? "$899/year" : "$89/month";
}
