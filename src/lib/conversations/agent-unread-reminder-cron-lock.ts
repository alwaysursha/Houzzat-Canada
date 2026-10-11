/**
 * Same-isolate overlap guard for chat unread-reminder cron HTTP handler.
 * Durable streak claims still prevent duplicate reminders across isolates.
 */

let chatUnreadReminderCronInFlight = false;

export function beginChatUnreadReminderCronRun(): boolean {
  if (chatUnreadReminderCronInFlight) return false;
  chatUnreadReminderCronInFlight = true;
  return true;
}

export function endChatUnreadReminderCronRun(): void {
  chatUnreadReminderCronInFlight = false;
}

export function isChatUnreadReminderCronRunInFlight(): boolean {
  return chatUnreadReminderCronInFlight;
}

export function summarizeChatUnreadReminderCronError(error: unknown): string {
  if (error instanceof Error && error.name.trim()) return error.name;
  return "ERROR";
}
