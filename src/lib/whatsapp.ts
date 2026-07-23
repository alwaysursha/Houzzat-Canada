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
    "Hi Houzzat — I'd like to Ask the Expert about this listing:",
    `MLS® ${input.mlsNumber}`,
    `${input.addressLine}, ${input.city}`,
    question ? `Question: ${question}` : null,
  ].filter(Boolean);

  const text = lines.join("\n");
  return `https://wa.me/${input.phoneDigits}?text=${encodeURIComponent(text)}`;
}
