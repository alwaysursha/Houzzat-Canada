/** Digits-only E.164 without leading + for wa.me links, e.g. 14165550100 */
export function normalizeWhatsAppNumber(raw: string | undefined | null) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10 ? digits : null;
}

export function getExpertWhatsAppNumber() {
  return normalizeWhatsAppNumber(
    process.env.NEXT_PUBLIC_WHATSAPP_EXPERT ??
      process.env.NEXT_PUBLIC_WHATSAPP_NUMBER,
  );
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
