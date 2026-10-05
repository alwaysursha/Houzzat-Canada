import type { CustomerOptionalEmailCategory } from "@/lib/communications/classification";
import { CUSTOMER_OPTIONAL_EMAIL_CATEGORIES } from "@/lib/communications/classification";

export type PreferenceCenterEmailCategoryCopy = {
  category: CustomerOptionalEmailCategory;
  title: string;
  description: string;
  footnote?: string;
};

export const PREFERENCE_CENTER_EMAIL_CATEGORIES: PreferenceCenterEmailCategoryCopy[] =
  [
    {
      category: "property_watch",
      title: "Property Watch",
      description:
        "Price changes, status changes and important updates for properties you're watching.",
    },
    {
      category: "area_watch",
      title: "Area Watch",
      description:
        "New listings and sold or leased activity in areas you're watching.",
    },
    {
      category: "saved_search",
      title: "Saved Search Alerts",
      description: "Updates related to your saved property searches.",
      footnote:
        "Saved-search email is managed with your search settings today; this preference is ready for when a dedicated sender is available.",
    },
    {
      category: "buyer_digest",
      title: "Daily Home Digest",
      description:
        "Personalized property recommendations and updates based on your home search.",
    },
    {
      category: "seller_report",
      title: "Seller & Market Updates",
      description: "Property and market reports related to selling your home.",
    },
    {
      category: "agent_communication",
      title: "Updates From Your Agent",
      description:
        "Shortlists, CMA reports and other optional updates sent by your real estate agent.",
    },
    {
      category: "marketing",
      title: "Houzzat News & Updates",
      description:
        "Product news, useful tips, features and promotional communications.",
      footnote:
        "Marketing email is not currently sent in production; this preference is ready when it is.",
    },
  ];

export function preferenceCenterCategoryOrder(): CustomerOptionalEmailCategory[] {
  return [...CUSTOMER_OPTIONAL_EMAIL_CATEGORIES];
}

export function assertPreferenceCenterCatalogComplete(): boolean {
  const titles = new Set(
    PREFERENCE_CENTER_EMAIL_CATEGORIES.map((item) => item.category),
  );
  return CUSTOMER_OPTIONAL_EMAIL_CATEGORIES.every((category) =>
    titles.has(category),
  );
}
