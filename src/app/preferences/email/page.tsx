import type { Metadata } from "next";
import { PreferenceCenterClient } from "@/components/preferences/PreferenceCenterClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Communication Preferences",
  robots: { index: false, follow: false },
};

/**
 * Customer Communication Preference Center.
 * GET is always non-mutating. Token stays in the request URL / in-memory
 * client prop only — never persisted to storage or analytics.
 */
export default async function PreferenceEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; action?: string }>;
}) {
  const params = await searchParams;
  const token =
    typeof params.token === "string" && params.token.trim().length >= 16
      ? params.token.trim()
      : null;
  const action =
    typeof params.action === "string" ? params.action.trim() : null;

  return (
    <PreferenceCenterClient
      initialToken={token}
      initialAction={action === "unsubscribe" ? "unsubscribe" : null}
    />
  );
}
