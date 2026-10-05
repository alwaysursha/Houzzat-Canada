export const dynamic = "force-dynamic";

/**
 * Phase 2B-1 placeholder. GET must not mutate preferences.
 * Phase 2B-2 will render the Preference Center.
 */
export default async function PreferenceEmailPlaceholderPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; action?: string }>;
}) {
  const params = await searchParams;
  const intent =
    params.action === "unsubscribe"
      ? "unsubscribe presentation intent only — nothing was changed by opening this link."
      : "opening this link did not change your email subscriptions.";

  return (
    <main style={{ maxWidth: 560, margin: "40px auto", padding: 24 }}>
      <h1>Email preferences</h1>
      <p>This Preference Center page is not available yet. {intent}</p>
    </main>
  );
}
