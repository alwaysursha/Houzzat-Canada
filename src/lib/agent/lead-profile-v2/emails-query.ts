/** Client/server-safe Conversations/email-list helpers. No Prisma. */
import type { LeadProfileV2Email } from "@/lib/agent/lead-profile-v2/types";

export const V2_EMAILS_RESOURCE_KEY = "emails";

/** Same default page size as the current Lead Profile emails panel. */
export const V2_EMAILS_PAGE_SIZE = 20;
export const V2_EMAILS_PAGE_MAX = 40;

export type V2EmailsStamp = {
  leadId: string;
  epoch: number;
};

export function parseV2EmailsSearchParams(url: URL): {
  before: Date | null;
} {
  const beforeRaw = url.searchParams.get("before");
  const parsed = beforeRaw ? new Date(beforeRaw) : null;
  return {
    before: parsed && !Number.isNaN(parsed.getTime()) ? parsed : null,
  };
}

export function v2EmailsPageTake(take?: number) {
  return Math.min(Math.max(take ?? V2_EMAILS_PAGE_SIZE, 1), V2_EMAILS_PAGE_MAX);
}

export function canApplyV2EmailsResponse(input: {
  stamp: V2EmailsStamp;
  current: V2EmailsStamp;
}): boolean {
  return (
    input.stamp.leadId === input.current.leadId &&
    input.stamp.epoch === input.current.epoch
  );
}

export function v2EmailsAppendCursorKey(input: {
  leadId: string;
  before: string | null;
}): string {
  return `${input.leadId}|${input.before ?? ""}`;
}

export function shouldSkipDuplicateV2EmailsAppend(input: {
  inFlight: boolean;
  lastCursorKey: string | null;
  cursorKey: string;
}): boolean {
  if (input.inFlight) return true;
  return input.lastCursorKey === input.cursorKey;
}

export function mergeV2Emails(
  prev: LeadProfileV2Email[],
  next: LeadProfileV2Email[],
  append: boolean,
): LeadProfileV2Email[] {
  if (!append) return next;
  const seen = new Set(prev.map((row) => row.id));
  return [...prev, ...next.filter((row) => !seen.has(row.id))];
}
