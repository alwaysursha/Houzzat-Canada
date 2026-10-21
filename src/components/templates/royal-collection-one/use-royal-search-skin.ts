"use client";

import { useTemplatePresentation } from "@/components/templates/TemplatePresentationProvider";
import { ROYAL_COLLECTION_ONE_TEMPLATE_ID } from "@/lib/tenancy/templates";

/** True only when marketing tenancy has resolved Royal Collection. Admin and agent search stay on the default context. */
export function useRoyalCollectionSearchSkin(): boolean {
  return useTemplatePresentation().templateId === ROYAL_COLLECTION_ONE_TEMPLATE_ID;
}
