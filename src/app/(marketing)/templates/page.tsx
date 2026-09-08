import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { HouzzatProPlatformTemplates } from "@/components/platform/public/HouzzatProPlatformTemplates";
import {
  PLATFORM_TEMPLATES_DOCUMENT_DESCRIPTION,
  PLATFORM_TEMPLATES_DOCUMENT_TITLE,
} from "@/lib/platform/public/platform-pricing-templates-copy";
import { isHouzzatProPlatformRoot } from "@/lib/tenancy/platform-hostname";

export const dynamic = "force-dynamic";

async function isPlatformTemplatesHost(): Promise<boolean> {
  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host")?.split(":")[0]?.trim() ??
    headerStore.get("host")?.split(":")[0]?.trim() ??
    "";
  return Boolean(host && isHouzzatProPlatformRoot(host));
}

export async function generateMetadata(): Promise<Metadata> {
  if (!(await isPlatformTemplatesHost())) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }
  return {
    title: PLATFORM_TEMPLATES_DOCUMENT_TITLE,
    description: PLATFORM_TEMPLATES_DOCUMENT_DESCRIPTION,
    robots: { index: true, follow: true },
  };
}

export default async function PlatformTemplatesPage() {
  if (!(await isPlatformTemplatesHost())) {
    notFound();
  }
  return <HouzzatProPlatformTemplates />;
}
