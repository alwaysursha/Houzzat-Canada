import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { requireAgentUser } from "@/lib/agent";
import { SITE_NAME } from "@/lib/constants";

const nav = [
  { href: "/agent", label: "Overview" },
  { href: "/agent/leads", label: "Pipeline" },
  { href: "/agent/appointments", label: "Appointments" },
  { href: "/agent/cma", label: "CMA" },
  { href: "/search", label: "Search" },
];

export default async function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const agent = await requireAgentUser();
  if (!agent) {
    redirect("/auth/sign-in?callbackUrl=/agent");
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
              Agent desk · {agent.name ?? agent.email}
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
