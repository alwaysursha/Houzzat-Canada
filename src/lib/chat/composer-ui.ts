/**
 * Pure helpers for WhatsApp-style chat composers (mic ↔ send).
 */

export function chatComposerHasSendableText(body: string | null | undefined): boolean {
  return Boolean(body?.trim());
}

export type ChatComposerTrailingAction = "mic" | "send";

export function chatComposerTrailingAction(input: {
  body: string | null | undefined;
  voiceBusy?: boolean;
}): ChatComposerTrailingAction {
  if (input.voiceBusy) return "mic";
  return chatComposerHasSendableText(input.body) ? "send" : "mic";
}
