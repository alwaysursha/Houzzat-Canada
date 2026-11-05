import { HighOctaneEmailPreviewGallery } from "@/lib/email/high-octane/preview-gallery";

type PageProps = {
  searchParams: Promise<{ template?: string }>;
};

export default async function HighOctaneEmailPreviewsPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  return (
    <HighOctaneEmailPreviewGallery
      basePath="/platform/email-previews"
      templateId={params.template}
    />
  );
}
