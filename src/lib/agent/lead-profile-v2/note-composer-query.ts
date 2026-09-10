/** Client/server-safe global note-composer helpers. No Prisma. */

export const V2_NOTE_CREATE_ENDPOINT = "/api/agent/notes";

export const V2_NOTE_SUCCESS_MESSAGE_MS = 2000;

export type V2NoteCategory = "GENERAL" | "CALL";

export type V2NoteCreatePayload = {
  leadId: string;
  body: string;
  category: V2NoteCategory;
  pinned: boolean;
};

export function v2NoteComposerPlaceholder(category: V2NoteCategory) {
  return category === "CALL" ? "Add a call note..." : "Add a note...";
}

export function v2NoteCreatePayload(input: {
  leadId: string;
  body: string;
  category: V2NoteCategory;
  pinned: boolean;
}): V2NoteCreatePayload {
  return {
    leadId: input.leadId,
    body: input.body.trim(),
    category: input.category,
    pinned: input.pinned,
  };
}

export function shouldSkipV2NoteSubmit(input: {
  body: string;
  inFlight: boolean;
}): boolean {
  return input.inFlight || !input.body.trim();
}

export function v2NoteComposerCanSubmit(input: {
  body: string;
  pending: boolean;
}): boolean {
  return !input.pending && Boolean(input.body.trim());
}

export function v2NoteComposerSuccessMessage(input: {
  category: V2NoteCategory;
  pinned: boolean;
}): string {
  const kind = input.category === "CALL" ? "Call" : "General";
  return input.pinned ? `${kind} note pinned` : `${kind} note saved`;
}

export function v2NoteComposerFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not save note";
}

/**
 * Visible data after POST /api/agent/notes: a new activity row and a
 * follow-up note. Intake-notes blob / Last Touch are not first-paint
 * composer surfaces — do not reload shell, rail, Looking For, or
 * next-reminder.
 */
export function v2NoteCreateRefreshPlan(tab: string): {
  reloadTimeline: true;
  reloadTasks: boolean;
  invalidateTasks: boolean;
  reloadShell: false;
  reloadRail: false;
  reloadLookingFor: false;
  reloadNextReminder: false;
  reloadEmails: false;
  reloadAppointments: false;
  reloadEngagement: false;
} {
  const onReminders = tab === "reminders";
  return {
    reloadTimeline: true,
    reloadTasks: onReminders,
    invalidateTasks: !onReminders,
    reloadShell: false,
    reloadRail: false,
    reloadLookingFor: false,
    reloadNextReminder: false,
    reloadEmails: false,
    reloadAppointments: false,
    reloadEngagement: false,
  };
}

export function applyV2NoteCreateRefresh(input: {
  tab: string;
  reloadTimeline: () => void;
  reloadTasks: () => void;
  invalidateTasks: () => void;
}) {
  const plan = v2NoteCreateRefreshPlan(input.tab);
  input.reloadTimeline();
  if (plan.reloadTasks) input.reloadTasks();
  if (plan.invalidateTasks) input.invalidateTasks();
}
