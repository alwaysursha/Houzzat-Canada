import { redirect } from "next/navigation";
import { OwnerListingForm } from "@/components/owner/OwnerListingForm";
import { requireOwnerUser } from "@/lib/owner/auth";

export const metadata = { title: "New owner listing" };

export default async function OwnerNewListingPage() {
  const user = await requireOwnerUser();
  if (!user) redirect("/auth/sign-in?callbackUrl=/owner/new");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-ink">List your property</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/65">
          Sale listings are CAD $1,499. Lease listings are CAD $499. Optional
          services can be added below. After payment, Houzzat admin reviews your
          listing before it goes live.
        </p>
      </div>
      <OwnerListingForm initialPhone={user.phone ?? ""} />
    </div>
  );
}
