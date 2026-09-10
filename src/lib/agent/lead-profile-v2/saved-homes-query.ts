/** Client/server-safe Saved Homes helpers. No Prisma. */

export const V2_SAVED_HOMES_RESOURCE_KEY = "saved-homes";

/** Same bound as the current Engagement saved-listings list. */
export const V2_SAVED_HOMES_TAKE = 20;

export type V2SavedHomesStamp = {
  leadId: string;
  epoch: number;
};

export function canApplyV2SavedHomesResponse(input: {
  stamp: V2SavedHomesStamp;
  current: V2SavedHomesStamp;
}): boolean {
  return (
    input.stamp.leadId === input.current.leadId &&
    input.stamp.epoch === input.current.epoch
  );
}
