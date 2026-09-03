import { redirect } from "next/navigation";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { requirePlatformPageAccess } from "@/lib/platform/ui/auth";
import {
  getPlatformMe,
  PlatformApiClientError,
} from "@/lib/platform/ui/api-client";

export default async function PlatformShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePlatformPageAccess();

  let me;
  try {
    me = await getPlatformMe();
  } catch (error) {
    if (error instanceof PlatformApiClientError && error.status === 403) {
      redirect("/platform/access-denied");
    }
    throw error;
  }

  return <PlatformShell me={me}>{children}</PlatformShell>;
}
