import { PlatformSuspendedPage } from "@/components/platform/status/PlatformSuspendedPage";
import { resolvePlatformSuspendedHost } from "@/lib/platform/status/resolve-suspended-host";

export default async function NotFound() {
  if (await resolvePlatformSuspendedHost()) {
    return <PlatformSuspendedPage />;
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-white px-6 text-slate-900">
      <h1 className="text-center text-lg font-medium tracking-tight">
        404 | This page could not be found.
      </h1>
    </div>
  );
}
