/** Client/server-safe Appointments helpers. No Prisma. */

export const V2_APPOINTMENTS_RESOURCE_KEY = "appointments";

/** Same bound as the current Lead Profile appointments panel. */
export const V2_APPOINTMENTS_TAKE = 40;

export type V2AppointmentsStamp = {
  leadId: string;
  epoch: number;
};

export function canApplyV2AppointmentsResponse(input: {
  stamp: V2AppointmentsStamp;
  current: V2AppointmentsStamp;
}): boolean {
  return (
    input.stamp.leadId === input.current.leadId &&
    input.stamp.epoch === input.current.epoch
  );
}
