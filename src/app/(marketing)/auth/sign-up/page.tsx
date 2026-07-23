import { Suspense } from "react";
import { AuthRouteBridge } from "@/components/auth/AuthRouteBridge";

export const metadata = { title: "Sign up" };

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
