import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { auth } from "@/lib/auth";
import { SITE_NAME } from "@/lib/constants";

const nav = [
  { href: "/account", label: "Your Houzzat" },
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
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/sign-in?callbackUrl=/account");
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
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">{children}</main>
    </div>
  );
}
