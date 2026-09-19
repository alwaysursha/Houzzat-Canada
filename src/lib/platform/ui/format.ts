import { formatHouzzatProZonedDateTime } from "@/lib/platform/datetime";

export function formatPlatformDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parts = formatHouzzatProZonedDateTime(value, { dateMonth: "short" });
  if (!parts) return value;
  return `${parts.date}, ${parts.time}`;
}

/** Scheduled appointment display — same zone as customer emails. */
export function formatPlatformScheduledAt(
  value: string | null | undefined,
): string {
  if (!value) return "—";
  const parts = formatHouzzatProZonedDateTime(value, { dateMonth: "short" });
  if (!parts) return value;
  return `${parts.date}, ${parts.time} (${parts.timeZoneLabel})`;
}

export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function titleCaseStatus(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
