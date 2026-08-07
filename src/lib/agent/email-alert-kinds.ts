/** Email kinds that are property / market alerts (incl. 6AM digests). */
export const PROPERTY_ALERT_EMAIL_KINDS = new Set([
  "saved_search_digest",
  "neighborhood_weekly",
  "price_reduction",
  "sold_alert",
  "just_listed",
  "property_update",
]);

export function isPropertyAlertEmailKind(kind: string | null | undefined): boolean {
  if (!kind) return false;
  return PROPERTY_ALERT_EMAIL_KINDS.has(kind);
}

export function propertyAlertEmailLabel(kind: string | null | undefined): string {
  switch (kind) {
    case "saved_search_digest":
      return "Morning digest";
    case "neighborhood_weekly":
      return "Neighborhood report";
    case "price_reduction":
      return "Price drop";
    case "sold_alert":
      return "Sold alert";
    case "just_listed":
      return "Just listed";
    case "property_update":
      return "Property update";
    default:
      return "Property alert";
  }
}
