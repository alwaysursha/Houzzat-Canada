import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { HouzzatProPlatformPricing } from "@/components/platform/public/HouzzatProPlatformPricing";
import {
  PLATFORM_PRICING_DOCUMENT_DESCRIPTION,
  PLATFORM_PRICING_DOCUMENT_TITLE,
} from "@/lib/platform/public/platform-pricing-templates-copy";
import { isHouzzatProPlatformRoot } from "@/lib/tenancy/platform-hostname";

export const dynamic = "force-dynamic";

async function isPlatformPricingHost(): Promise<boolean> {
  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host")?.split(":")[0]?.trim() ??
    headerStore.get("host")?.split(":")[0]?.trim() ??
    "";
  return Boolean(host && isHouzzatProPlatformRoot(host));
}

export async function generateMetadata(): Promise<Metadata> {
  if (!(await isPlatformPricingHost())) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }
  return {
    title: PLATFORM_PRICING_DOCUMENT_TITLE,
    description: PLATFORM_PRICING_DOCUMENT_DESCRIPTION,
    alternates: { canonical: "https://houzzatpro.com/pricing" },
    robots: { index: true, follow: true },
    openGraph: {
      title: PLATFORM_PRICING_DOCUMENT_TITLE,
      description: PLATFORM_PRICING_DOCUMENT_DESCRIPTION,
      url: "https://houzzatpro.com/pricing",
      siteName: "HouzzatPRO",
      type: "website",
    },
  };
}

export default async function PlatformPricingPage() {
  if (!(await isPlatformPricingHost())) {
    notFound();
  }
  return <HouzzatProPlatformPricing />;
}
