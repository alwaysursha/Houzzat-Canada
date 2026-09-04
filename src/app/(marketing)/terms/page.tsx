import type { Metadata } from "next";
import { headers } from "next/headers";
import { ConsumerTermsDocument } from "@/components/site/ConsumerTermsDocument";
import { LegalDocument } from "@/components/site/LegalDocument";
import { HOUZZATPRO_TERMS_MARKDOWN } from "@/lib/platform/legal/content/houzzatpro-terms";
import { renderSimpleLegalMarkdown } from "@/lib/platform/legal/render";
import {
  HOUZZATPRO_TERMS_EFFECTIVE_LABEL,
  HOUZZATPRO_TERMS_VERSION,
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
      title: "Terms of Service | HouzzatPRO",
      description: "HouzzatPRO software platform Terms of Service.",
      robots: { index: true, follow: true },
    };
  }
  return buildMarketingPageMetadata({
    title: "Terms of Use",
    description: `Terms governing use of our websites and mobile apps.`,
    path: "/terms",
  });
}

export default async function TermsPage() {
  if (await isPlatformLegalHost()) {
    return (
      <LegalDocument
        title="HouzzatPRO Terms of Service"
        updated={HOUZZATPRO_TERMS_EFFECTIVE_LABEL}
        version={HOUZZATPRO_TERMS_VERSION}
      >
        {renderSimpleLegalMarkdown(HOUZZATPRO_TERMS_MARKDOWN)}
      </LegalDocument>
    );
  }
  return <ConsumerTermsDocument />;
}
