/**
 * HouzzatPRO branding for Stripe Embedded Checkout.
 * Mirrors theminiwear's stripeCheckoutBrandingSettings pattern.
 */

export const HOUZZATPRO_CHECKOUT_PAGE_BG = "#f4f6f5" as const;
export const HOUZZATPRO_CHECKOUT_NAVY = "#07111f" as const;
export const HOUZZATPRO_CHECKOUT_EMERALD = "#059669" as const;

/**
 * Stripe Checkout Session branding_settings — blends embed with HouzzatPRO palette.
 * Typed loosely: stripe@18 types omit this field though the API accepts it.
 */
export function houzzatProCheckoutBrandingSettings(): {
  background_color: string;
  button_color: string;
  border_style: "rounded";
} {
  return {
    background_color: HOUZZATPRO_CHECKOUT_PAGE_BG,
    button_color: HOUZZATPRO_CHECKOUT_EMERALD,
    border_style: "rounded",
  };
}
