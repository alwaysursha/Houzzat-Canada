/**
 * Client-safe buyer/seller desk intent. Do not import lead-intake from UI.
 * Buyer+seller → seller desk. Seller-only → seller. Otherwise buyer.
 */
import type { LeadIntent } from "@prisma/client";

export function resolveLeadIntent(flags: {
  isBuyer?: boolean | null;
  isSeller?: boolean | null;
}): LeadIntent {
  if (flags.isSeller) return "SELLER";
  return "BUYER";
}
