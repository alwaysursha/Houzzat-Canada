import { PLATFORM_PRODUCT_NAME } from "@/lib/constants";

/** Canonical HouzzatPRO technical support destination (owner-approved). */
export const HOUZZATPRO_TECHNICAL_SUPPORT_URL =
  "https://houzzatpro.com/support" as const;

export const HOUZZATPRO_TECHNICAL_SUPPORT_LABEL =
  "Contact HouzzatPRO Technical Support" as const;

export type HouzzatProSupportCta = {
  label: typeof HOUZZATPRO_TECHNICAL_SUPPORT_LABEL;
  href: string;
};

export function resolveHouzzatProSupportCta(): HouzzatProSupportCta {
  const override = process.env.NEXT_PUBLIC_HOUZZATPRO_SUPPORT_URL?.trim();
  return {
    label: HOUZZATPRO_TECHNICAL_SUPPORT_LABEL,
    href: override || HOUZZATPRO_TECHNICAL_SUPPORT_URL,
  };
}
