import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/Providers";
import { buildRootMetadata } from "@/lib/seo";
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

export const metadata: Metadata = buildRootMetadata();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en-CA"
      className={`${jakarta.variable} ${fraunces.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
