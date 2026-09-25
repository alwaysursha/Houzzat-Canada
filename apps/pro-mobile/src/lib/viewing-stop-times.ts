/**
 * Viewing stop clocks.
 *
 * Build the stored instant from calendar parts. Do not parse
 * "YYYY-MM-DDTHH:mm" with Date(), which Hermes treats as UTC and
 * shifts ARRIVE/LEAVE away from the agent's local clock.
 */

export function viewingInstantIso(day: Date, clock: Date): string {
  const local = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    clock.getHours(),
    clock.getMinutes(),
    0,
    0,
  );
  return local.toISOString();
}

export function clockFromIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export type ViewingStopTimeDraft = {
  arrive: Date | null;
  leave: Date | null;
};

export function stopTimePayload(input: {
  stopId: string;
  day: Date | null;
  draft: ViewingStopTimeDraft | undefined;
}): { stopId: string; startsAt: string | null; endsAt: string | null } | null {
  if (!input.day || !input.draft) return null;
  return {
    stopId: input.stopId,
    startsAt: input.draft.arrive
      ? viewingInstantIso(input.day, input.draft.arrive)
      : null,
    endsAt: input.draft.leave
      ? viewingInstantIso(input.day, input.draft.leave)
      : null,
  };
}
