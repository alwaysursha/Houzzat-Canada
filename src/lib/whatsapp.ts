/** Digits-only E.164 without leading + for wa.me links, e.g. 14165550100 */
export function normalizeWhatsAppNumber(raw: string | undefined | null) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10 ? digits : null;
}

export const WHATSAPP_UNAVAILABLE_COPY =
  "WhatsApp isn’t available for this professional yet. Please use another contact option on this site.";

export type WhatsAppTemplateKind = "AGENT" | "OTHER";

/**
 * Tenant-safe WhatsApp destination. Never applies a global/env number unless
 * the workspace is Houzzat and an explicit Houzzat-only fallback is passed in.
 */
export function resolveTenantWhatsAppNumber(input: {
  templateKind: WhatsAppTemplateKind;
  agentCellPhone?: string | null;
  contactPhone?: string | null;
  isHouzzatWorkspace: boolean;
  /** Applied only when isHouzzatWorkspace is true. */
  houzzatEnvFallback?: string | null;
}): string | null {
  const cell = normalizeWhatsAppNumber(input.agentCellPhone);
  const contact = normalizeWhatsAppNumber(input.contactPhone);
  const houzzatFallback = input.isHouzzatWorkspace
    ? normalizeWhatsAppNumber(input.houzzatEnvFallback)
    : null;

  switch (input.templateKind) {
    case "AGENT":
      return cell ?? contact ?? houzzatFallback;
    case "OTHER":
      return contact ?? houzzatFallback;
    default: {
      const _exhaustive: never = input.templateKind;
      return _exhaustive;
    }
  }
}

export function buildListingExpertWhatsAppUrl(input: {
  phoneDigits: string;
  mlsNumber: string;
  addressLine: string;
  city: string;
  question?: string;
}) {
  const question = input.question?.trim();
  const lines = [
    "Hi, I'd like to Ask the Expert about this listing:",
    `MLS® ${input.mlsNumber}`,
    `${input.addressLine}, ${input.city}`,
    question ? `Question: ${question}` : null,
  ].filter(Boolean);

  const text = lines.join("\n");
  return `https://wa.me/${input.phoneDigits}?text=${encodeURIComponent(text)}`;
}

export function buildValuationMeetingWhatsAppUrl(input: {
  phoneDigits: string;
  address: string;
  city?: string | null;
  estimateLow?: number | null;
  estimateHigh?: number | null;
}) {
  const place = [input.address, input.city].filter(Boolean).join(", ");
  const range =
    input.estimateLow != null && input.estimateHigh != null
      ? `Online range so far: $${input.estimateLow.toLocaleString()} – $${input.estimateHigh.toLocaleString()}.`
      : null;
  const text = [
    "Hi, I'd like to book a meeting for a more accurate home valuation:",
    place,
    range,
  ]
    .filter(Boolean)
    .join("\n");
  return `https://wa.me/${input.phoneDigits}?text=${encodeURIComponent(text)}`;
}

export function buildRoutePlannerExpertWhatsAppUrl(input: {
  phoneDigits: string;
  startAddress: string;
  startAt: string;
  stops: Array<{ mlsNumber: string; addressLine: string; city: string }>;
  message?: string;
  sharePath?: string | null;
}) {
  const message = input.message?.trim();
  const startLabel = new Date(input.startAt).toLocaleString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const stopLines = input.stops.map((stop, index) => {
    return `${index + 1}. MLS® ${stop.mlsNumber} — ${stop.addressLine}, ${stop.city}`;
  });
  const lines = [
    "Hi, I'd like to book viewings from my Route Planner:",
    `Starting from: ${input.startAddress}`,
    `First viewing time: ${startLabel}`,
    "",
    "Homes:",
    ...stopLines,
    message ? `\nNote: ${message}` : null,
    input.sharePath ? `\nItinerary: ${input.sharePath}` : null,
  ].filter((line): line is string => line != null);

  const text = lines.join("\n");
  return `https://wa.me/${input.phoneDigits}?text=${encodeURIComponent(text)}`;
}
