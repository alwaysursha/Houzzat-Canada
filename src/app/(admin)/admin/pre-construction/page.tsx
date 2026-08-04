import { PreConAdminClient } from "@/components/admin/PreConAdminClient";

export const metadata = { title: "Pre-construction" };

export default function AdminPreConPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight text-ink sm:text-4xl">Pre-construction</h1>
        <p className="mt-2 text-sm text-ink/60">
          Manual inventory — not from TRREB. Public hub: /pre-construction
        </p>
      </div>
      <PreConAdminClient />
    </div>
  );
}
