import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { localHighOctaneEmailPreviewAllowed } from "@/lib/email/high-octane/local-preview-access";
import { HighOctaneEmailPreviewGallery } from "@/lib/email/high-octane/preview-gallery";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "HIGH OCTANE email previews",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ template?: string }>;
};

export default async function LocalHighOctaneEmailPreviewPage({
  searchParams,
}: PageProps) {
  const headerList = await headers();
  const allowed = localHighOctaneEmailPreviewAllowed({
    env: process.env,
    host: headerList.get("host"),
    forwardedHost: headerList.get("x-forwarded-host"),
  });
  if (!allowed) notFound();

  const params = await searchParams;
  return (
    <HighOctaneEmailPreviewGallery
      basePath="/dev/high-octane-email-previews"
      templateId={params.template}
    />
  );
}
