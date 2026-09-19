/**
 * HouzzatPRO display timezone helpers.
 * V1 always formats in America/Toronto. Callers may later pass a
 * per-prospect/user IANA zone without rewriting email or Admin formatters.
 */

export const HOUZZATPRO_DEFAULT_TIME_ZONE = "America/Toronto";
export const HOUZZATPRO_DEFAULT_TIME_ZONE_LABEL = "Eastern Time (ET)";

export type HouzzatProZonedDateTime = {
  instant: Date;
  timeZoneId: string;
  timeZoneLabel: string;
  date: string;
  time: string;
};

export function formatHouzzatProZonedDateTime(
  instant: Date | string,
  options?: {
    timeZoneId?: string;
    timeZoneLabel?: string;
    dateMonth?: "long" | "short";
  },
): HouzzatProZonedDateTime | null {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return null;

  const timeZoneId = options?.timeZoneId?.trim() || HOUZZATPRO_DEFAULT_TIME_ZONE;
  const timeZoneLabel =
    options?.timeZoneLabel?.trim() ||
    (timeZoneId === HOUZZATPRO_DEFAULT_TIME_ZONE
      ? HOUZZATPRO_DEFAULT_TIME_ZONE_LABEL
      : timeZoneId);
  const dateMonth = options?.dateMonth ?? "long";

  const datePart = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZoneId,
    year: "numeric",
    month: dateMonth,
    day: "numeric",
  }).format(date);

  const timePart = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZoneId,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  return {
    instant: date,
    timeZoneId,
    timeZoneLabel,
    date: datePart,
    time: timePart,
  };
}

export function formatHouzzatProZonedDateTimeLabel(
  instant: Date | string,
  options?: {
    timeZoneId?: string;
    timeZoneLabel?: string;
  },
): string | null {
  const parts = formatHouzzatProZonedDateTime(instant, {
    ...options,
    dateMonth: "short",
  });
  if (!parts) return null;
  return `${parts.date}, ${parts.time} (${parts.timeZoneLabel})`;
}
