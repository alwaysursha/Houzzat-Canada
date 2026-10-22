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
  env?: NodeJS.ProcessEnv;
}): RoyalCollectionOperationalPresentation {
  if (!input.listingFound) return "not-found";
  const templateId = resolveHighOctaneStagingTemplateId({
    workspaceSlug: input.workspaceSlug,
    env: input.env,
  });
  if (templateId === ROYAL_COLLECTION_ONE_TEMPLATE_ID) return "royal-collection";
  return "standard";
}
