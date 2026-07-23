import { LandingAdminClient } from "@/components/admin/LandingAdminClient";

export const metadata = { title: "Landing pages" };

export default function AdminLandingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-ink">Custom landings</h1>
        <p className="mt-2 text-sm text-ink/60">
          Create campaign pages at /lp/your-slug for ads and area targeting.
        </p>
      </div>
      <LandingAdminClient />
    </div>
  );
}
