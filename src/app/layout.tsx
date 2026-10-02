import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { listingDetailFontVariables } from "@/fonts/publica-sans-round";
import { Providers } from "@/components/Providers";
import { getHouzzatAndroidBootScript } from "@/lib/mobile/houzzat-android-boot";
import { getStaleBuildBootScript } from "@/lib/navigation/stale-build-recovery";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const jakarta = localFont({
  src: "../fonts/plus-jakarta-sans-latin-wght.woff2",
  variable: "--font-jakarta",
  weight: "400 700",
  display: "swap",
});

const fraunces = localFont({
  src: "../fonts/fraunces-latin-wght.woff2",
  variable: "--font-fraunces",
  weight: "500 700",
  display: "swap",
});

/** Minimal root metadata — hostname-aware layouts own tenant/Houzzat titles. */
export const metadata: Metadata = {
  title: "Real Estate",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en-CA"
      className={`${jakarta.variable} ${fraunces.variable} ${listingDetailFontVariables} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <script
          dangerouslySetInnerHTML={{ __html: getHouzzatAndroidBootScript() }}
        />
        <script
          dangerouslySetInnerHTML={{ __html: getStaleBuildBootScript() }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
