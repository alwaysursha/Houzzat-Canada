import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { auth } from "@/lib/auth";
import { SITE_NAME } from "@/lib/constants";

const nav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/fsbo", label: "Owner listings" },
  { href: "/admin/ads", label: "Ad Studio" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/partners", label: "Partners" },
  { href: "/admin/landings", label: "Landings" },
  { href: "/admin/pre-construction", label: "Pre-construction" },
  { href: "/agent", label: "CRM" },
  { href: "/search", label: "Search" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/sign-in?callbackUrl=/admin");
  }
  if (session.user.role !== "ADMIN") {
    redirect(session.user.role === "AGENT" ? "/agent" : "/account");
  }

  return (
    <div className="min-h-full bg-mist">
      <header className="border-b border-line bg-surface/90">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <Link href="/" className="font-display text-xl text-ink">
              {SITE_NAME}
            </Link>
            <p className="text-xs uppercase tracking-[0.14em] text-ink/45">
              Admin · {session.user.email}
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
