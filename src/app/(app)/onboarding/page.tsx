import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { OwnerOnboardingClient } from "@/components/onboarding/OwnerOnboardingClient";

export default async function OwnerOnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/onboarding");
  }

  return (
    <main className="min-h-screen bg-[#f4f6f5] px-4 py-12">
      <OwnerOnboardingClient />
    </main>
  );
}
