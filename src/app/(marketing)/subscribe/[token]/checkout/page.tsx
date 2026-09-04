import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PrivateOfferEmbeddedCheckout } from "@/components/platform/public/PrivateOfferEmbeddedCheckout";
import { PrivateOfferUnavailable } from "@/components/platform/public/PrivateOfferProposal";
import {
  PRIVATE_OFFER_CHECKOUT_PAGE_TITLE,
  PRIVATE_OFFER_DOCUMENT_TITLE,
} from "@/lib/platform/offers/private-offer-copy";
import { PRIVATE_OFFER_PATH_PREFIX } from "@/lib/platform/offers/constants";
import { resolvePrivateOfferByRawToken } from "@/lib/platform/offers/private-offer";
import { isHouzzatProPlatformRoot } from "@/lib/tenancy/platform-hostname";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ token: string }>;
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
    title: `${PRIVATE_OFFER_CHECKOUT_PAGE_TITLE} | HouzzatPRO`,
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false, noimageindex: true },
    },
  };
}

/**
 * On-site Stripe Embedded Checkout for an accepted private offer.
 * Webhook remains payment authority — this page only mounts Checkout.
 */
export default async function PrivateOfferCheckoutPage({ params }: PageProps) {
  if (!(await assertPlatformHost())) {
    notFound();
  }

  const { token } = await params;
  const rawToken = typeof token === "string" ? token : "";
  if (!rawToken || rawToken.length < 16) {
    return <PrivateOfferUnavailable />;
  }

  const result = await resolvePrivateOfferByRawToken({ rawToken });
  if (!result.ok) {
    return <PrivateOfferUnavailable />;
  }

  if (result.kind === "proposal") {
    redirect(`${PRIVATE_OFFER_PATH_PREFIX}/${encodeURIComponent(rawToken)}`);
  }

  if (result.presentation.paymentComplete) {
    redirect(`${PRIVATE_OFFER_PATH_PREFIX}/${encodeURIComponent(rawToken)}`);
  }

  if (!result.presentation.checkoutEligible) {
    return <PrivateOfferUnavailable />;
  }

  void PRIVATE_OFFER_DOCUMENT_TITLE;

  return <PrivateOfferEmbeddedCheckout rawToken={rawToken} />;
}
