import type { Metadata } from "next";
import { PLATFORM_PRODUCT_NAME } from "@/lib/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: `Master Admin | ${PLATFORM_PRODUCT_NAME}`,
    template: `%s | ${PLATFORM_PRODUCT_NAME} Master Admin`,
  },
  robots: { index: false, follow: false },
};

export default function PlatformRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
