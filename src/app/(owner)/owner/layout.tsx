import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { requireOwnerUser } from "@/lib/owner/auth";
import { SITE_NAME } from "@/lib/constants";

const nav = [
  { href: "/owner", label: "My listings" },
  { href: "/owner/new", label: "New listing" },
  { href: "/owner/inquiries", label: "Inquiries" },
  { href: "/owner/viewings", label: "Viewings" },
  { href: "/owner/orders", label: "Orders" },
  { href: "/search", label: "Search" },
  { href: "/account", label: "Account" },
];

export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireOwnerUser();
  if (!user) {
    redirect("/auth/sign-in?callbackUrl=/owner");
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
              Owner desk · FSBO / FLBO
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
