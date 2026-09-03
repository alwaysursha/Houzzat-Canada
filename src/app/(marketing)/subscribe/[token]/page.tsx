import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  PrivateOfferProposal,
  PrivateOfferUnavailable,
} from "@/components/platform/public/PrivateOfferProposal";
import { PRIVATE_OFFER_DOCUMENT_TITLE } from "@/lib/platform/offers/private-offer-copy";
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
    title: PRIVATE_OFFER_DOCUMENT_TITLE,
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false, noimageindex: true },
    },
  };
}

export default async function PrivateSubscribeOfferPage({ params }: PageProps) {
  if (!(await assertPlatformHost())) {
    notFound();
  }

  const { token } = await params;
  const result = await resolvePrivateOfferByRawToken({ rawToken: token });

  if (!result.ok) {
    return <PrivateOfferUnavailable />;
  }

  return <PrivateOfferProposal presentation={result.presentation} />;
}
