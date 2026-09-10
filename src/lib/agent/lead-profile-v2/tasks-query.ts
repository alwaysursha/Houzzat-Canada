/** Client/server-safe Task & Reminders helpers. No Prisma. */

export const V2_TASKS_RESOURCE_KEY = "tasks";

/** Same bound as the current Lead Profile tasks panel. */
export const V2_TASKS_TAKE = 40;

export type V2TasksStamp = {
  leadId: string;
  epoch: number;
};

export function canApplyV2TasksResponse(input: {
  stamp: V2TasksStamp;
  current: V2TasksStamp;
}): boolean {
  return (
    input.stamp.leadId === input.current.leadId &&
    input.stamp.epoch === input.current.epoch
  );
}
