import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { buildMarketingAuthPageMetadata } from "@/lib/tenancy/marketing-page-metadata";

export async function generateMetadata(): Promise<Metadata> {
  const metadata = await buildMarketingAuthPageMetadata("Reset password");
  return {
    ...metadata,
    robots: { index: false, follow: false },
  };
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = params.token?.trim() ?? "";

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <ResetPasswordForm token={token} />
    </main>
  );
}
