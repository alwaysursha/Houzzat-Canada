import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { OwnerOnboardingClient } from "@/components/onboarding/OwnerOnboardingClient";
import { buildOwnerOnboardingProSignInUrl } from "@/lib/platform/activation/onboarding-pro-auth";
import { buildSyntheticRequestFromHeaders } from "@/lib/tenancy/auth-origin";
import { resolveRequestTenancy } from "@/lib/tenancy/resolve-request-tenancy";

export const dynamic = "force-dynamic";

export default async function OwnerOnboardingPage() {
  const request = await buildSyntheticRequestFromHeaders();
  if (!request) {
    notFound();
  }

  const tenancy = await resolveRequestTenancy(request);
  if (!tenancy.ok) {
    notFound();
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect(
      buildOwnerOnboardingProSignInUrl({
        workspaceId: tenancy.workspaceId,
        returnPath: "/onboarding",
      }),
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f6f5] px-4 py-12">
      <OwnerOnboardingClient />
    </main>
  );
}
