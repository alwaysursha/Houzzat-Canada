import type { Metadata } from "next";
import { headers } from "next/headers";
import { ConsumerPrivacyDocument } from "@/components/site/ConsumerPrivacyDocument";
import { LegalDocument } from "@/components/site/LegalDocument";
import { HOUZZATPRO_PRIVACY_MARKDOWN } from "@/lib/platform/legal/content/houzzatpro-privacy";
import { renderSimpleLegalMarkdown } from "@/lib/platform/legal/render";
import {
  HOUZZATPRO_PRIVACY_EFFECTIVE_LABEL,
  HOUZZATPRO_PRIVACY_VERSION,
} from "@/lib/platform/legal/versions";
import { buildMarketingPageMetadata } from "@/lib/tenancy/marketing-page-metadata";
import { isHouzzatProPlatformRoot } from "@/lib/tenancy/platform-hostname";

async function isPlatformLegalHost(): Promise<boolean> {
  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host")?.split(":")[0]?.trim() ??
    headerStore.get("host")?.split(":")[0]?.trim() ??
    "";
  return Boolean(host && isHouzzatProPlatformRoot(host));
}

export async function generateMetadata(): Promise<Metadata> {
  if (await isPlatformLegalHost()) {
    return {
      title: "Privacy Policy | HouzzatPRO",
      description: "HouzzatPRO Privacy Policy for the software platform and sales.",
      robots: { index: true, follow: true },
    };
  }
  return buildMarketingPageMetadata({
    title: "Privacy Policy",
    description: `How we collect, use, and protect your personal information.`,
    path: "/privacy",
  });
}

export default async function PrivacyPage() {
  if (await isPlatformLegalHost()) {
    return (
      <LegalDocument
        title="HouzzatPRO Privacy Policy"
        updated={HOUZZATPRO_PRIVACY_EFFECTIVE_LABEL}
        version={HOUZZATPRO_PRIVACY_VERSION}
      >
        {renderSimpleLegalMarkdown(HOUZZATPRO_PRIVACY_MARKDOWN)}
      </LegalDocument>
    );
  }
  return <ConsumerPrivacyDocument />;
}
