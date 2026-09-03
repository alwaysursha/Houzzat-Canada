import { PlatformSuspendedPage } from "@/components/platform/status/PlatformSuspendedPage";
import { resolvePlatformSuspendedHost } from "@/lib/platform/status/resolve-suspended-host";

/** Stage 5.6 — minimal layout for tenant-branded public Viewings share pages. */
export default async function ViewingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (await resolvePlatformSuspendedHost()) {
    return <PlatformSuspendedPage />;
  }

  return (
    <div className="min-h-dvh bg-[var(--mist)] text-[var(--ink)]">{children}</div>
  );
}
