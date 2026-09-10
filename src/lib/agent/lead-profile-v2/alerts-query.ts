/** Client/server-safe Alerts inbox helpers. No Prisma. */

export const V2_ALERTS_RESOURCE_KEY = "alerts";

/** Same bound as the current Engagement alerts inbox list. */
export const V2_ALERTS_TAKE = 15;

export type V2AlertsStamp = {
  leadId: string;
  epoch: number;
};

export function canApplyV2AlertsResponse(input: {
  stamp: V2AlertsStamp;
  current: V2AlertsStamp;
}): boolean {
  return (
    input.stamp.leadId === input.current.leadId &&
    input.stamp.epoch === input.current.epoch
  );
}
