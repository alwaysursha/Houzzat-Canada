import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthRouteBridge } from "@/components/auth/AuthRouteBridge";
import { buildMarketingAuthPageMetadata } from "@/lib/tenancy/marketing-page-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return buildMarketingAuthPageMetadata("Sign up");
}

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-ink/50">
          Opening sign up…
        </div>
      }
    >
      <AuthRouteBridge mode="sign-up" />
    </Suspense>
  );
}
