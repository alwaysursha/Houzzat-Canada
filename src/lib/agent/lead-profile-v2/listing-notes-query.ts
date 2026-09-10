/** Client/server-safe Listing Notes helpers. No Prisma. */

export const V2_LISTING_NOTES_RESOURCE_KEY = "listing-notes";

/** Same bound as the current Engagement listing-notes list. */
export const V2_LISTING_NOTES_TAKE = 15;

/** Presentation-only preview length. Matches current Lead Profile UI. */
export const V2_LISTING_NOTES_PREVIEW_CHARS = 120;

export type V2ListingNotesStamp = {
  leadId: string;
  epoch: number;
};

export function canApplyV2ListingNotesResponse(input: {
  stamp: V2ListingNotesStamp;
  current: V2ListingNotesStamp;
}): boolean {
  return (
    input.stamp.leadId === input.current.leadId &&
    input.stamp.epoch === input.current.epoch
  );
}
