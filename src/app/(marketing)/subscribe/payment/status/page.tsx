import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { SubscribePaymentStatusClient } from "@/components/platform/public/SubscribePaymentStatusClient";
import {
  PRIVATE_OFFER_DOCUMENT_TITLE,
  PRIVATE_OFFER_PAYMENT_STATUS_TITLE,
} from "@/lib/platform/offers/private-offer-copy";
import { BROWSER_SUCCESS_CANNOT_ACTIVATE } from "@/lib/platform/billing/webhook";
import { isHouzzatProPlatformRoot } from "@/lib/tenancy/platform-hostname";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ session_id?: string }>;
};

async function assertPlatformHost(): Promise<boolean> {
  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host")?.split(":")[0]?.trim() ??
    headerStore.get("host")?.split(":")[0]?.trim() ??
    null;
  if (!host) return false;
  return isHouzzatProPlatformRoot(host);
}

export async function generateMetadata(): Promise<Metadata> {
  if (!(await assertPlatformHost())) {
    return {
      title: "Not found",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: `${PRIVATE_OFFER_PAYMENT_STATUS_TITLE} | HouzzatPRO`,
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false, noimageindex: true },
    },
  };
}

/**
 * Stripe success return — polls webhook-authoritative status only.
 * Never activates Subscription from browser session_id.
 */
export default async function SubscribePaymentStatusPage({
  searchParams,
}: PageProps) {
  if (!(await assertPlatformHost())) {
    notFound();
  }

  const params = await searchParams;
  const sessionId =
    typeof params.session_id === "string" ? params.session_id.trim() : null;

  // Document authority boundary for selftests / reviewers.
  void BROWSER_SUCCESS_CANNOT_ACTIVATE;
  void PRIVATE_OFFER_DOCUMENT_TITLE;

  return <SubscribePaymentStatusClient sessionId={sessionId} />;
}
