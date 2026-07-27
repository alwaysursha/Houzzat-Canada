import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: `Coming Soon | ${SITE_NAME}`,
  description:
    "Houzzat is launching soon. Contact Ali Syed, Sales Representative at Royal LePage Credit Valley Real Estate.",
  robots: { index: false, follow: false },
};

export default function ComingSoonPage() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(1200px 800px at 10% -10%, rgb(15 107 76 / 0.18), transparent 60%), radial-gradient(900px 700px at 90% 0%, rgb(31 122 140 / 0.12), transparent 55%), linear-gradient(180deg, #e7f0eb 0%, var(--mist) 45%, #e3ebe6 100%)",
        }}
      />

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16 sm:px-8">
        <p className="font-display text-5xl tracking-tight text-ink sm:text-6xl">
          {SITE_NAME}
        </p>
        <p className="mt-4 inline-flex w-fit rounded-md border border-canopy/25 bg-canopy/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-canopy-deep">
          Coming soon
        </p>
        <h1 className="mt-6 max-w-xl text-2xl font-medium leading-snug text-ink/85 sm:text-3xl">
          We’re finishing the home search experience.
        </h1>
        <p className="mt-3 max-w-lg text-base leading-relaxed text-ink/60">
          Houzzat isn’t open to the public yet. In the meantime, you can reach
          Ali Syed directly through Royal LePage Credit Valley Real Estate.
        </p>

        <div className="mt-10 flex flex-col gap-5 rounded-xl border border-line/80 bg-surface/90 p-5 shadow-sm backdrop-blur-sm sm:flex-row sm:items-start sm:gap-6 sm:p-6">
          <div className="inline-flex shrink-0 self-start rounded-md bg-white px-2.5 py-2 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
            <img
              src="/images/royal-lepage-logo.png"
              alt="Royal LePage"
              width={140}
              height={52}
              className="block h-9 w-[140px] object-contain object-left"
            />
          </div>
          <address className="not-italic text-sm leading-relaxed text-ink/70">
            <p className="font-display text-xl text-ink">Ali Syed</p>
            <p className="mt-1 font-medium text-ink/80">Sales Representative</p>
            <p className="mt-3">Royal LePage Credit Valley Real Estate</p>
            <p>1-10045 Hurontario St.</p>
            <p>Brampton, ON, L6Z 0E6</p>
            <p className="mt-3">
              Office:{" "}
              <a
                href="tel:+19057935000"
                className="font-medium text-canopy hover:underline"
              >
                905-793-5000
              </a>
            </p>
            <p>
              Cell:{" "}
              <a
                href="tel:+16472214949"
                className="font-medium text-canopy hover:underline"
              >
                647-221-4949
              </a>
            </p>
          </address>
        </div>
      </main>

      <footer className="relative z-10 px-6 pb-8 text-center text-xs text-ink/40 sm:px-8">
        © {new Date().getFullYear()} {SITE_NAME}
      </footer>
    </div>
  );
}
