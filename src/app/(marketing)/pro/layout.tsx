import type { Metadata } from "next";
import { PLATFORM_PRODUCT_NAME } from "@/lib/constants";

/** HouzzatPRO platform bootstrap — no tenant MLS chrome or tenancy resolution. */
export const metadata: Metadata = {
  title: PLATFORM_PRODUCT_NAME,
  robots: { index: false, follow: false },
};

export default function HouzzatProPlatformBootstrapLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
