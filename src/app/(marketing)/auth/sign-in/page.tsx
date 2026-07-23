import { Suspense } from "react";
import { AuthRouteBridge } from "@/components/auth/AuthRouteBridge";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-ink/50">
          Opening sign in…
        </div>
      }
    >
      <AuthRouteBridge mode="sign-in" />
    </Suspense>
  );
}
