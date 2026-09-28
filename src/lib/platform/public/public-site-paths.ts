/**
 * HouzzatPRO public marketing paths that own the approved header/footer.
 * Does not include /platform — that URL is the internal platform console.
 */

import { headers } from "next/headers";
import { isHouzzatProPlatformRoot } from "@/lib/tenancy/platform-hostname";
import { normalizeRequestPathname } from "@/lib/platform/public/platform-marketing-shell";

export const HOUZZATPRO_MARKETING_ORIGIN = "https://houzzatpro.com";

export const PUBLIC_PRODUCT_PATH = "/product" as const;

export const OWNED_CHROME_PATHS = [
  "/pricing",
  "/product",
  "/product/crm",
  "/product/lead-routing",
  "/product/conversations",
  "/product/website",
  "/product/mls-search",
  "/product/lead-capture",
  "/product/alerts",
  "/product/properties",
  "/product/viewing-planner",
  "/product/mobile",
  "/solutions/agents",
  "/solutions/teams",
  "/solutions/brokerages",
  "/solutions/generate-leads",
  "/solutions/convert-leads",
  "/solutions/client-experience",
  "/solutions/work-from-anywhere",
  "/resources",
  "/blog",
  "/product-updates",
  "/customer-stories",
  "/faq",
  "/contact",
] as const;

export type OwnedChromePath = (typeof OWNED_CHROME_PATHS)[number];

export function isOwnedChromePath(path: string): path is OwnedChromePath {
  const normalized = normalizeRequestPathname(path);
  return (OWNED_CHROME_PATHS as readonly string[]).includes(normalized);
}

export async function isHouzzatProPlatformApexRequest(): Promise<boolean> {
  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host")?.split(":")[0]?.trim() ??
    headerStore.get("host")?.split(":")[0]?.trim() ??
    "";
  return Boolean(host && isHouzzatProPlatformRoot(host));
}

/** Apex host + a page that renders the approved marketing chrome itself. */
export async function isHouzzatProOwnedChromeRequest(): Promise<boolean> {
  if (!(await isHouzzatProPlatformApexRequest())) return false;
  const headerStore = await headers();
  const raw =
    headerStore.get("x-houzzat-request-path") ??
    headerStore.get("next-url") ??
    "";
  return isOwnedChromePath(normalizeRequestPathname(raw));
}
