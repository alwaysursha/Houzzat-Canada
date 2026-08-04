import { PartnersAdminClient } from "@/components/admin/PartnersAdminClient";

export const metadata = { title: "Referral partners" };

export default function AdminPartnersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight text-ink sm:text-4xl">Referral partners</h1>
        <p className="mt-2 text-sm text-ink/60">
          Mortgage, legal, and inspection partners for tracked handoffs.
        </p>
      </div>
      <PartnersAdminClient />
    </div>
  );
}
