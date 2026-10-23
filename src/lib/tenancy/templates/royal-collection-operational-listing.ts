/**
 * Chooses the property-details presentation after a listing has already
 * been authorized. This module does not load listings or grant access.
 */
import { resolveHighOctaneStagingTemplateId } from "@/lib/tenancy/templates/high-octane-staging";
import { ROYAL_COLLECTION_ONE_TEMPLATE_ID } from "@/lib/tenancy/templates/types";

export type RoyalCollectionOperationalPresentation =
  | "not-found"
  | "royal-collection"
  | "standard";

export function selectRoyalCollectionOperationalPresentation(input: {
  workspaceSlug: string | null | undefined;
  listingFound: boolean;
  hostname?: string | null;
  /** Template already chosen from the persisted workspace theme. */
  assignedTemplateId?: string | null;
  env?: NodeJS.ProcessEnv;
  branchId?: string | null;
}): RoyalCollectionOperationalPresentation {
  if (!input.listingFound) return "not-found";
  if (input.assignedTemplateId === ROYAL_COLLECTION_ONE_TEMPLATE_ID) return "royal-collection";
  const templateId = resolveHighOctaneStagingTemplateId({
    workspaceSlug: input.workspaceSlug,
    hostname: input.hostname,
    env: input.env,
    branchId: input.branchId,
  });
  if (templateId === ROYAL_COLLECTION_ONE_TEMPLATE_ID) return "royal-collection";
  return "standard";
}
