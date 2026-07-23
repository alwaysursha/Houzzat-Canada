/** Payment factor for monthly mortgage (Canadian-style compounded semi-annually approx via standard amortization). */
export function monthlyMortgagePayment(
  principal: number,
  annualRatePct: number,
  amortYears: number,
): number {
  if (principal <= 0 || amortYears <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  const n = amortYears * 12;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

export type AffordabilityInput = {
  income: number;
  downPayment: number;
  ratePct: number;
  amortYears: number;
  propertyTaxAnnual?: number;
  heatMonthly?: number;
  condoFeeMonthly?: number;
  /** Target max GDS ratio, default 39% */
  maxGdsPct?: number;
};

export type AffordabilityResult = {
  maxPurchase: number;
  maxMortgage: number;
  monthlyHousing: number;
  monthlyMortgage: number;
  gdsPct: number;
  disclaimer: string;
};

export function estimateAffordability(
  input: AffordabilityInput,
): AffordabilityResult {
  const maxGds = (input.maxGdsPct ?? 39) / 100;
  const monthlyIncome = input.income / 12;
  const maxHousing = monthlyIncome * maxGds;
  const taxMonthly = (input.propertyTaxAnnual ?? 0) / 12;
  const heat = input.heatMonthly ?? 100;
  const condo = input.condoFeeMonthly ?? 0;
  const fixed = taxMonthly + heat + condo;

  // Binary search max mortgage for payment ≈ maxHousing - fixed
  let lo = 0;
  let hi = Math.max(monthlyIncome * 12 * 8, 100_000);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const pmt = monthlyMortgagePayment(mid, input.ratePct, input.amortYears);
    if (pmt + fixed > maxHousing) hi = mid;
    else lo = mid;
  }

  const maxMortgage = Math.round(lo);
  const monthlyMortgage = monthlyMortgagePayment(
    maxMortgage,
    input.ratePct,
    input.amortYears,
  );
  const monthlyHousing = monthlyMortgage + fixed;
  const maxPurchase = Math.round(maxMortgage + input.downPayment);

  return {
    maxPurchase,
    maxMortgage,
    monthlyHousing: Math.round(monthlyHousing),
    monthlyMortgage: Math.round(monthlyMortgage),
    gdsPct: Math.round((monthlyHousing / monthlyIncome) * 1000) / 10,
    disclaimer:
      "Illustrative only — not a mortgage pre-approval or lender offer. Rates, stress tests, and qualification rules change; talk to a licensed mortgage professional.",
  };
}
