/** Client/server-safe Area Monitors helpers. No Prisma. */

export const V2_AREA_MONITORS_RESOURCE_KEY = "area-monitors";

/** Same bound as the current Engagement area-monitors list. */
export const V2_AREA_MONITORS_TAKE = 10;

export type V2AreaMonitorsStamp = {
  leadId: string;
  epoch: number;
};

export function canApplyV2AreaMonitorsResponse(input: {
  stamp: V2AreaMonitorsStamp;
  current: V2AreaMonitorsStamp;
}): boolean {
  return (
    input.stamp.leadId === input.current.leadId &&
    input.stamp.epoch === input.current.epoch
  );
}
