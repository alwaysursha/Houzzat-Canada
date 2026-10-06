/**
 * Client-safe CRM activity headlines. No Prisma, Node, or database imports.
 */

export function labelActivity(type: string) {
  switch (type) {
    case "contact_update_request":
      return "Contact update requested";
    case "contact_updated_by_customer":
      return "Contact updated by customer";
    case "contact_update":
      return "Contact updated";
    case "property_watch_removed":
      return "Property Watch stopped";
    case "area_watch_removed":
      return "Area Watch stopped";
    case "saved_search_removed":
      return "Saved Search deleted";
    default:
      return String(type).replaceAll("_", " ");
  }
}

function metaRecord(meta: unknown): Record<string, unknown> | null {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    return meta as Record<string, unknown>;
  }
  return null;
}

/**
 * Agent-facing headline for persistent LeadActivity rows.
 * Does not rewrite stored types/bodies. Email vs SMS vs unknown unsubscribe
 * is inferred from existing body/meta only.
 */
export function leadActivityDisplayTitle(input: {
  type: string;
  body?: string | null;
  meta?: unknown;
}): string {
  const body = input.body ?? "";
  const meta = metaRecord(input.meta);
  const channel = typeof meta?.channel === "string" ? meta.channel : "";
  const action = typeof meta?.action === "string" ? meta.action : "";

  if (input.type === "unsubscribe") {
    if (channel === "sms" || body.toLowerCase().includes("sms")) {
      return "SMS alerts turned off";
    }
    if (
      channel === "email" ||
      action === "global_optional_email_off" ||
      /email alerts/i.test(body)
    ) {
      return "Email alerts turned off";
    }
    return "Notifications turned off";
  }

  if (input.type === "contact_updated_by_customer") {
    if (
      body === "Customer re-enabled email alerts" ||
      action === "global_optional_email_on"
    ) {
      return "Email alerts resumed";
    }
    return "Contact updated by customer";
  }

  return labelActivity(input.type);
}
