import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "HouzzatPro",
  robots: { index: false, follow: false },
};

/**
 * Capacitor Pro cold-start surface (`server.url` → /pro).
 * Routing is handled by HouzzatProStartup in Providers (session role only).
 */
export default function HouzzatProStartPage() {
  return (
    <main className="mx-auto flex min-h-[50dvh] w-full max-w-md flex-col items-center justify-center px-5 py-16 text-center">
      <p className="text-sm font-medium text-ink/50">Opening HouzzatPro…</p>
    </main>
  );
}
