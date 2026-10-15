/**
 * Browser handoff from /property Claim CTA → signup qualification funnel.
 * Not proof of ownership — seller-interest prefill only.
 */

export const CLAIM_ADDRESS_CONTEXT_STORAGE_KEY =
  "houzzat:claim-address-context" as const;

export type ClaimAddressContext = {
  formattedAddress: string;
  unitNumber: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  city: string | null;
  province: string | null;
  propertyPath: string;
  savedAt: string;
};

export function rememberClaimAddressContext(
  context: ClaimAddressContext,
  storage: Pick<Storage, "setItem"> | null = typeof sessionStorage !== "undefined"
    ? sessionStorage
    : null,
): void {
  if (!storage) return;
  try {
    storage.setItem(CLAIM_ADDRESS_CONTEXT_STORAGE_KEY, JSON.stringify(context));
  } catch {
    // ignore
  }
}

export function readClaimAddressContext(
  storage: Pick<Storage, "getItem"> | null = typeof sessionStorage !== "undefined"
    ? sessionStorage
    : null,
): ClaimAddressContext | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(CLAIM_ADDRESS_CONTEXT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClaimAddressContext;
    if (!parsed?.formattedAddress?.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearClaimAddressContext(
  storage: Pick<Storage, "removeItem"> | null = typeof sessionStorage !==
  "undefined"
    ? sessionStorage
    : null,
): void {
  if (!storage) return;
  try {
    storage.removeItem(CLAIM_ADDRESS_CONTEXT_STORAGE_KEY);
  } catch {
    // ignore
  }
}
