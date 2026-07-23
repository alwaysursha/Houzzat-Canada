import { FsboAdminClient } from "@/components/admin/FsboAdminClient";

export const metadata = { title: "Owner listings" };

export default function AdminFsboPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-ink">Owner listings</h1>
        <p className="mt-2 text-sm text-ink/60">
          Review FSBO/FLBO submissions, waive payment, and publish free listings.
        </p>
      </div>
      <FsboAdminClient />
    </div>
  );
}
