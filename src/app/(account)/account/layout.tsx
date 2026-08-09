import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { MobileBottomNav } from "@/components/site/MobileBottomNav";
import { requireCustomerUser } from "@/lib/account";
import { auth } from "@/lib/auth";
import { SITE_NAME } from "@/lib/constants";
import { isDatabaseUnavailableError } from "@/lib/errors";

const nav = [
  { href: "/account", label: "Your Houzzat" },
  { href: "/route-planner", label: "Route Planner" },
  { href: "/account/saved", label: "Saved" },
  { href: "/account/notes", label: "Notes" },
  { href: "/account/searches", label: "Searches" },
  { href: "/account/watchlist", label: "Watchlist" },
  { href: "/account/activity", label: "Activity" },
  { href: "/search", label: "Search" },
  { href: "/", label: "Home" },
];

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session;
  try {
    session = await auth();
  } catch (error) {
    console.error("[account-layout] auth failed", error);
    throw error;
  }

  if (!session?.user) {
    redirect("/auth/sign-in?callbackUrl=/account");
  }

  // JWT may still decrypt after a DB rebuild while the user id is gone.
  // Clear it so we don't bounce /account ↔ /auth/sign-in forever.
  // If the DB is down, do NOT log them out — surface the error boundary instead.
  let customer;
  try {
    customer = await requireCustomerUser();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) throw error;
    console.error("[account-layout] customer load failed", error);
    throw error;
  }

  if (!customer) {
    redirect("/api/auth/logout");
  }

  if (session.user.role === "ADMIN") {
    redirect("/admin");
  }
  if (session.user.role === "AGENT") {
    redirect("/agent");
  }

  return (
    <div className="min-h-full bg-mist">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-mist/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <Link href="/" className="font-display text-2xl text-ink">
              {SITE_NAME}
            </Link>
            <p className="text-xs uppercase tracking-[0.14em] text-ink/45">
              Your Houzzat
            </p>
          </div>
          {/* Desktop account nav — mobile uses bottom nav + More sheet. */}
          <nav className="hidden flex-wrap items-center gap-3 text-sm font-medium md:flex">
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
      <main className="mx-auto max-w-6xl px-4 py-10 pb-[calc(2.5rem+var(--mobile-bottom-nav,0px))] sm:px-6 md:pb-10">
        {children}
      </main>
      <MobileBottomNav />
    </div>
  );
}
