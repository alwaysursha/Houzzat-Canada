/**
 * Stage 5.12B — sanitize CMA PDF download filenames.
 */

export function sanitizeCmaPdfFilename(input: {
  addressLine: string;
  preparedDate?: Date;
}): string {
  const date = (input.preparedDate ?? new Date())
    .toISOString()
    .slice(0, 10);
  const raw = input.addressLine.trim() || "Property";
  const slug = raw
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const safe = slug || "Property";
  return `CMA-${safe}-${date}.pdf`;
}
