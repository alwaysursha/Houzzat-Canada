import { TeamInviteClient } from "@/components/auth/TeamInviteClient";

export const metadata = { title: "Team invite" };

export default async function TeamInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <TeamInviteClient token={token} />
    </main>
  );
}
