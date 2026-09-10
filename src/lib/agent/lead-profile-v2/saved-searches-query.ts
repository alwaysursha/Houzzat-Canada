/** Client/server-safe Saved Searches helpers. No Prisma. */

export const V2_SAVED_SEARCHES_RESOURCE_KEY = "saved-searches";

/** Same bound as the current Engagement saved-searches list. */
export const V2_SAVED_SEARCHES_TAKE = 10;

export type V2SavedSearchesStamp = {
  leadId: string;
  epoch: number;
};

export function canApplyV2SavedSearchesResponse(input: {
  stamp: V2SavedSearchesStamp;
  current: V2SavedSearchesStamp;
}): boolean {
  return (
    input.stamp.leadId === input.current.leadId &&
    input.stamp.epoch === input.current.epoch
  );
}
