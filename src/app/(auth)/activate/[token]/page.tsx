import { OwnerActivationClient } from "@/components/auth/OwnerActivationClient";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function OwnerActivatePage({ params }: PageProps) {
  const { token } = await params;
  return (
    <main className="min-h-screen bg-[#f4f6f5] px-4 py-16">
      <OwnerActivationClient token={token} />
    </main>
  );
}
