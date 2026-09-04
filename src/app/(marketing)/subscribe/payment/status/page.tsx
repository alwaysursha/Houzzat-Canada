import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { HouzzatProWordmark } from "@/components/auth/HouzzatProWordmark";
import {
  PRIVATE_OFFER_CTA_SUPPORT_LABEL,
  PRIVATE_OFFER_DOCUMENT_TITLE,
  PRIVATE_OFFER_PAYMENT_STATUS_BODY,
  PRIVATE_OFFER_PAYMENT_STATUS_PENDING,
  PRIVATE_OFFER_PAYMENT_STATUS_TITLE,
} from "@/lib/platform/offers/private-offer-copy";
import { BROWSER_SUCCESS_CANNOT_ACTIVATE } from "@/lib/platform/billing/webhook";
import { resolveHouzzatProSupportCta } from "@/lib/platform/status";
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
 * Stripe success return — informational only.
 * Never activates Subscription from browser session_id (webhook is authority).
 */
export default async function SubscribePaymentStatusPage({
  searchParams,
}: PageProps) {
  if (!(await assertPlatformHost())) {
    notFound();
  }

  // Intentionally unused for activation — document authority boundary.
  const params = await searchParams;
  void params.session_id;
  void BROWSER_SUCCESS_CANNOT_ACTIVATE;
  void PRIVATE_OFFER_DOCUMENT_TITLE;

  const support = resolveHouzzatProSupportCta();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#07111f] px-4 py-16 text-center">
      <div className="w-full max-w-lg">
        <HouzzatProWordmark size="lg" className="text-white" />
        <h1 className="mt-10 font-display text-3xl font-semibold tracking-tight text-white">
          {PRIVATE_OFFER_PAYMENT_STATUS_TITLE}
        </h1>
        <p className="mt-4 text-base text-slate-300">
          {PRIVATE_OFFER_PAYMENT_STATUS_BODY}
        </p>
        <p className="mt-3 text-sm text-slate-400">
          {PRIVATE_OFFER_PAYMENT_STATUS_PENDING}
        </p>
        <Link
          href={support.href}
          className="mt-8 inline-flex rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-emerald-200 transition hover:border-emerald-400/40 hover:bg-white/5"
        >
          {PRIVATE_OFFER_CTA_SUPPORT_LABEL}
        </Link>
      </div>
    </div>
  );
}
