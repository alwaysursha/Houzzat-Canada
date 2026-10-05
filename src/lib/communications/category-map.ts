import type {
  CommunicationCategory as PrismaCommunicationCategory,
  CommunicationChannel as PrismaCommunicationChannel,
} from "@prisma/client";
import {
  CUSTOMER_OPTIONAL_EMAIL_CATEGORIES,
  type CommunicationCategory,
  type CommunicationChannel,
  type CustomerOptionalEmailCategory,
} from "@/lib/communications/classification";

export function toPrismaCommunicationCategory(
  category: CommunicationCategory,
): PrismaCommunicationCategory | null {
  switch (category) {
    case "property_watch":
      return "PROPERTY_WATCH";
    case "area_watch":
      return "AREA_WATCH";
    case "saved_search":
      return "SAVED_SEARCH";
    case "buyer_digest":
      return "BUYER_DIGEST";
    case "seller_report":
      return "SELLER_REPORT";
    case "agent_communication":
      return "AGENT_COMMUNICATION";
    case "marketing":
      return "MARKETING";
    case "account_security":
      return "ACCOUNT_SECURITY";
    case "contact_update":
      return "CONTACT_UPDATE";
    case "viewing":
      return "VIEWING";
    case "internal":
    case "unclassified":
      return null;
    default: {
      const _never: never = category;
      return _never;
    }
  }
}

export function fromPrismaCommunicationCategory(
  category: PrismaCommunicationCategory,
): CommunicationCategory {
  switch (category) {
    case "PROPERTY_WATCH":
      return "property_watch";
    case "AREA_WATCH":
      return "area_watch";
    case "SAVED_SEARCH":
      return "saved_search";
    case "BUYER_DIGEST":
      return "buyer_digest";
    case "SELLER_REPORT":
      return "seller_report";
    case "AGENT_COMMUNICATION":
      return "agent_communication";
    case "MARKETING":
      return "marketing";
    case "ACCOUNT_SECURITY":
      return "account_security";
    case "CONTACT_UPDATE":
      return "contact_update";
    case "VIEWING":
      return "viewing";
    default: {
      const _never: never = category;
      return _never;
    }
  }
}

export function toPrismaCommunicationChannel(
  channel: CommunicationChannel,
): PrismaCommunicationChannel {
  switch (channel) {
    case "email":
      return "EMAIL";
    case "push":
      return "PUSH";
    default: {
      const _never: never = channel;
      return _never;
    }
  }
}

export function fromPrismaCommunicationChannel(
  channel: PrismaCommunicationChannel,
): CommunicationChannel {
  switch (channel) {
    case "EMAIL":
      return "email";
    case "PUSH":
      return "push";
    default: {
      const _never: never = channel;
      return _never;
    }
  }
}

export function parseCustomerOptionalEmailCategory(
  value: string,
): CustomerOptionalEmailCategory | null {
  return (CUSTOMER_OPTIONAL_EMAIL_CATEGORIES as readonly string[]).includes(
    value,
  )
    ? (value as CustomerOptionalEmailCategory)
    : null;
}

/** Absence of a row = enabled. */
export function categoryPreferenceOrDefault(
  enabled: boolean | undefined | null,
): boolean {
  return enabled !== false;
}
