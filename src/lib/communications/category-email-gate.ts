import type { CommunicationCategory } from "@/lib/communications/classification";
import { customerCategoryEmailEnabled } from "@/lib/communications/customer-preferences";
import { prismaCommunicationPreferenceStore } from "@/lib/communications/preference-store";

/**
 * Fail-open on lookup errors so missing/partial DB never silently kills
 * production optional email. Missing row = enabled.
 */
export async function loadCategoryEmailEnabled(
  userId: string,
  category: CommunicationCategory,
): Promise<boolean> {
  try {
    return await customerCategoryEmailEnabled({
      store: prismaCommunicationPreferenceStore(),
      userId,
      category,
    });
  } catch (error) {
    console.error("[email:category-preference-lookup]", error);
    return true;
  }
}

export function crmOptionalEmailDenied(input: {
  contactConsentAt: Date | null;
  caslConsentAt: Date | null;
  emailAlertsEnabled: boolean | undefined;
  categoryEnabled: boolean;
}): "consent" | "email_alerts_off" | "category_off" | null {
  const consented =
    Boolean(input.contactConsentAt) || Boolean(input.caslConsentAt);
  if (!consented) return "consent";
  if (input.emailAlertsEnabled === false) return "email_alerts_off";
  if (!input.categoryEnabled) return "category_off";
  return null;
}
