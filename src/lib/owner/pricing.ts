export const OWNER_LISTING_TERMS_VERSION = "2026-07-1";
export const OWNER_COOP_CONSENT_VERSION = "2026-07-1";

export const OWNER_PRICING = {
  baseSale: 1499,
  baseLease: 499,
  cleaning: 350,
  staging: 2500,
  photography: 399,
  videography: 499,
  videographyWithPhoto: 349,
} as const;

export type OwnerAddonId =
  | "CLEANING"
  | "STAGING"
  | "PHOTOGRAPHY"
  | "VIDEOGRAPHY";

export type OwnerPricingInput = {
  transactionType: "SALE" | "LEASE";
  addOns: OwnerAddonId[];
};

export type OwnerPricingResult = {
  baseAmount: number;
  addOnLines: { id: OwnerAddonId; label: string; amount: number }[];
  discountAmount: number;
  totalAmount: number;
};

const ADDON_LABELS: Record<OwnerAddonId, string> = {
  CLEANING: "Professional cleaning",
  STAGING: "Staging",
  PHOTOGRAPHY: "Professional photography",
  VIDEOGRAPHY: "Professional videography",
};

export function calculateOwnerPricing(
  input: OwnerPricingInput,
): OwnerPricingResult {
  const addOns = [...new Set(input.addOns)];
  const baseAmount =
    input.transactionType === "LEASE"
      ? OWNER_PRICING.baseLease
      : OWNER_PRICING.baseSale;

  const hasPhoto = addOns.includes("PHOTOGRAPHY");
  const addOnLines: OwnerPricingResult["addOnLines"] = [];
  let discountAmount = 0;

  for (const id of addOns) {
    if (id === "STAGING" && input.transactionType !== "SALE") continue;
    if (id === "CLEANING") {
      addOnLines.push({
        id,
        label: ADDON_LABELS[id],
        amount: OWNER_PRICING.cleaning,
      });
    } else if (id === "STAGING") {
      addOnLines.push({
        id,
        label: ADDON_LABELS[id],
        amount: OWNER_PRICING.staging,
      });
    } else if (id === "PHOTOGRAPHY") {
      addOnLines.push({
        id,
        label: ADDON_LABELS[id],
        amount: OWNER_PRICING.photography,
      });
    } else if (id === "VIDEOGRAPHY") {
      const amount = hasPhoto
        ? OWNER_PRICING.videographyWithPhoto
        : OWNER_PRICING.videography;
      if (hasPhoto) {
        discountAmount +=
          OWNER_PRICING.videography - OWNER_PRICING.videographyWithPhoto;
      }
      addOnLines.push({
        id,
        label: hasPhoto
          ? `${ADDON_LABELS[id]} (photo bundle)`
          : ADDON_LABELS[id],
        amount,
      });
    }
  }

  const addOnsTotal = addOnLines.reduce((sum, line) => sum + line.amount, 0);
  return {
    baseAmount,
    addOnLines,
    discountAmount,
    totalAmount: baseAmount + addOnsTotal,
  };
}

export function ownerListingTag(
  transactionType: "SALE" | "LEASE" | string,
): "FSBO" | "FLBO" {
  return transactionType === "LEASE" ? "FLBO" : "FSBO";
}

export function coopCommissionCopy(transactionType: "SALE" | "LEASE") {
  if (transactionType === "LEASE") {
    return "I agree to pay a cooperating brokerage commission of one-half month’s rent plus HST on a successful lease.";
  }
  return "I agree to pay a cooperating brokerage commission of 2% plus HST on a successful sale.";
}
