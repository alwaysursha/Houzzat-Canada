import { formatHouzzatProZonedDateTimeLabel } from "../platform/datetime";

export const CALL_OUTCOME_ACTIVITY_LABEL = {
  SPOKE_TO_LEAD: "Spoke to Lead",
  LEFT_VOICEMAIL: "Left voicemail",
  INVALID_NUMBER: "Invalid phone number",
  WRONG_NUMBER: "Wrong phone number",
} as const;

export type CallOutcomeId = keyof typeof CALL_OUTCOME_ACTIVITY_LABEL;

export const CALL_OUTCOME_CHOICES: Array<{
  id: CallOutcomeId;
  label: string;
}> = [
  { id: "SPOKE_TO_LEAD", label: "Spoke to Lead" },
  { id: "LEFT_VOICEMAIL", label: "Left Voicemail" },
  { id: "INVALID_NUMBER", label: "Invalid Number" },
  { id: "WRONG_NUMBER", label: "Wrong Number" },
];

export function callOutcomeAllowsDetails(outcome: CallOutcomeId): boolean {
  return outcome === "SPOKE_TO_LEAD" || outcome === "LEFT_VOICEMAIL";
}

export function callOutcomeConfirmation(outcome: CallOutcomeId): string | null {
  if (outcome === "INVALID_NUMBER") {
    return "This number will be marked unverified and the customer will be asked to update their phone number. The current number stays on the profile until it is replaced.";
  }
  if (outcome === "WRONG_NUMBER") {
    return "This number will be marked unverified and the customer will be asked to provide the correct phone number. The current number stays on the profile until it is replaced.";
  }
  return null;
}

export function presentCallLeadActivity(input: {
  type: string;
  body: string | null;
  meta: unknown;
}): { title: string; body: string | null } | null {
  if (input.type !== "CALL") return null;
  if (!input.meta || typeof input.meta !== "object" || Array.isArray(input.meta)) {
    return null;
  }
  const outcome = (input.meta as { outcome?: unknown }).outcome;
  if (typeof outcome !== "string" || !(outcome in CALL_OUTCOME_ACTIVITY_LABEL)) {
    return null;
  }
  const title =
    CALL_OUTCOME_ACTIVITY_LABEL[outcome as CallOutcomeId];
  const noteId = (input.meta as { noteId?: unknown }).noteId;
  if (typeof noteId === "string" && noteId) {
    return { title, body: null };
  }
  const body = input.body?.trim() ?? "";
  return { title, body: body && body !== title ? body : null };
}

export function isCallOutcomeActivityTitle(title: string): boolean {
  return Object.values(CALL_OUTCOME_ACTIVITY_LABEL).includes(
    title as (typeof CALL_OUTCOME_ACTIVITY_LABEL)[CallOutcomeId],
  );
}

const TORONTO = "America/Toronto";

export type FollowUpChoice =
  | "later_today"
  | "tomorrow"
  | "in_2_days"
  | "custom"
  | "none";

export const FOLLOW_UP_CHOICES: Array<{ id: FollowUpChoice; label: string }> = [
  { id: "later_today", label: "Later Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "in_2_days", label: "In 2 Days" },
  { id: "custom", label: "Custom" },
  { id: "none", label: "No Follow-up" },
];

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function wallClock(date: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour") % 24,
    minute: value("minute"),
  };
}

function zonedWallTime(clock: WallClock, timeZone: string): Date {
  let utc = Date.UTC(
    clock.year,
    clock.month - 1,
    clock.day,
    clock.hour,
    clock.minute,
  );
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const seen = wallClock(new Date(utc), timeZone);
    const wanted = Date.UTC(
      clock.year,
      clock.month - 1,
      clock.day,
      clock.hour,
      clock.minute,
    );
    const seenUtc = Date.UTC(
      seen.year,
      seen.month - 1,
      seen.day,
      seen.hour,
      seen.minute,
    );
    const delta = wanted - seenUtc;
    if (delta === 0) break;
    utc += delta;
  }
  return new Date(utc);
}

function addCalendarDays(clock: WallClock, days: number): WallClock {
  const shifted = new Date(Date.UTC(clock.year, clock.month - 1, clock.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: clock.hour,
    minute: clock.minute,
  };
}

export function resolveFollowUpInstant(
  choice: FollowUpChoice | null,
  now: Date,
  customValue?: string,
): Date | null {
  if (!choice || choice === "none") return null;
  const today = wallClock(now, TORONTO);
  if (choice === "later_today") {
    const fivePm =
      today.hour < 16
        ? zonedWallTime({ ...today, hour: 17, minute: 0 }, TORONTO)
        : null;
    if (fivePm && fivePm.getTime() > now.getTime()) return fivePm;
    if (today.hour < 23) {
      const nextHour = zonedWallTime(
        { ...today, hour: today.hour + 1, minute: 0 },
        TORONTO,
      );
      if (nextHour.getTime() > now.getTime()) return nextHour;
    }
    const late = zonedWallTime({ ...today, hour: 23, minute: 45 }, TORONTO);
    return late.getTime() > now.getTime() ? late : new Date(now.getTime() + 15 * 60_000);
  }
  if (choice === "tomorrow" || choice === "in_2_days") {
    const day = addCalendarDays(today, choice === "tomorrow" ? 1 : 2);
    return zonedWallTime({ ...day, hour: 10, minute: 0 }, TORONTO);
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(customValue ?? "");
  if (!match) return null;
  return zonedWallTime(
    {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5]),
    },
    TORONTO,
  );
}

export function formatFollowUpLabel(instant: Date): string | null {
  return formatHouzzatProZonedDateTimeLabel(instant);
}

export function buildCallOutcomeRequest(input: {
  leadId: string;
  outcome: CallOutcomeId;
  note: string;
  followUpDueAt: Date | null;
  clientRequestId: string;
}): {
  leadId: string;
  outcome: CallOutcomeId;
  clientRequestId: string;
  note?: string;
  followUpDueAt?: string;
} {
  const payload: {
    leadId: string;
    outcome: CallOutcomeId;
    clientRequestId: string;
    note?: string;
    followUpDueAt?: string;
  } = {
    leadId: input.leadId,
    outcome: input.outcome,
    clientRequestId: input.clientRequestId,
  };
  if (!callOutcomeAllowsDetails(input.outcome)) return payload;
  const note = input.note.trim();
  if (note) payload.note = note;
  if (input.followUpDueAt) payload.followUpDueAt = input.followUpDueAt.toISOString();
  return payload;
}

export function newCallOutcomeRequestId(): string {
  return crypto.randomUUID();
}
