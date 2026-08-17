import type { Metadata } from "next";
import { HouzzatProSignInScreen } from "@/components/auth/HouzzatProSignInScreen";

export const metadata: Metadata = {
  title: "Sign in — HouzzatPro",
  robots: { index: false, follow: false },
};

/** Dedicated staff sign-in for HouzzatPro (native + web). */
export default function HouzzatProSignInPage() {
  return <HouzzatProSignInScreen />;
}
