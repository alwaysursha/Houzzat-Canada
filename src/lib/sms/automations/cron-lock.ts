/**
 * Same-isolate overlap guard for the SMS automation cron HTTP handler.
 * Duplicate SMS is still prevented by SmsAutomationDispatch uniqueness.
 */
let smsAutomationCronInFlight = false;

export function beginSmsAutomationCronRun(): boolean {
  if (smsAutomationCronInFlight) return false;
  smsAutomationCronInFlight = true;
  return true;
}

export function endSmsAutomationCronRun(): void {
  smsAutomationCronInFlight = false;
}

export function isSmsAutomationCronRunInFlight(): boolean {
  return smsAutomationCronInFlight;
}

export function summarizeSmsAutomationCronError(error: unknown): string {
  if (error instanceof Error && error.name.trim()) return error.name;
  return "ERROR";
}
