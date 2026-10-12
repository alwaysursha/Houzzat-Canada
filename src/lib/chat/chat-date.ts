/**
 * Local calendar day helpers for chat transcripts (separators + sticky label).
 */

export function chatMessageDayKey(
  iso: string,
  now = new Date(),
): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "invalid";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  void now;
  return `${y}-${m}-${d}`;
}

export function formatChatDayLabel(
  iso: string,
  now = new Date(),
  locale = "en-CA",
): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfMsg = new Date(date);
  startOfMsg.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfMsg.getTime()) / 86_400_000,
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) {
    return date.toLocaleDateString(locale, { weekday: "long" });
  }
  return date.toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

export function formatChatBubbleTime(
  iso: string,
  locale = "en-CA",
): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function shouldShowChatDaySeparator(input: {
  previousCreatedAt: string | null | undefined;
  currentCreatedAt: string;
}): boolean {
  if (!input.previousCreatedAt) return true;
  return (
    chatMessageDayKey(input.previousCreatedAt) !==
    chatMessageDayKey(input.currentCreatedAt)
  );
}
