/** Client/server-safe Property Watches helpers. No Prisma. */

export const V2_PROPERTY_WATCHES_RESOURCE_KEY = "property-watches";

/** Same bound as the current Engagement property-monitors list. */
export const V2_PROPERTY_WATCHES_TAKE = 20;

export type V2PropertyWatchesStamp = {
  leadId: string;
  epoch: number;
};

export function canApplyV2PropertyWatchesResponse(input: {
  stamp: V2PropertyWatchesStamp;
  current: V2PropertyWatchesStamp;
}): boolean {
  return (
    input.stamp.leadId === input.current.leadId &&
    input.stamp.epoch === input.current.epoch
  );
}
