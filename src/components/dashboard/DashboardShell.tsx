import Link from "next/link";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { SITE_NAME } from "@/lib/constants";

type NavItem = { href: string; label: string };

export function DashboardShell({
  title,
  eyebrow,
  nav,
  children,
}: {
  title: string;
  eyebrow: string;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full bg-mist">
      <header className="border-b border-line bg-surface/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <Link href="/" className="font-display text-xl text-ink">
              {SITE_NAME}
            </Link>
            <p className="text-xs uppercase tracking-[0.14em] text-ink/45">
              {eyebrow}
            </p>
          </div>
          <nav className="flex flex-wrap items-center gap-3 text-sm font-medium">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-ink/70 transition hover:text-canopy"
              >
                {item.label}
              </Link>
            ))}
            <SignOutButton className="ml-1 border-l border-line pl-3" />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="font-display text-4xl text-ink">{title}</h1>
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}
