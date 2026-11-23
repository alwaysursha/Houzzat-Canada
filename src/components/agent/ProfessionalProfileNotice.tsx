import Link from "next/link";
import { evaluateProfessionalAgentProfile } from "@/lib/agent/professional-profile";
import { splitStaffDisplayName } from "@/lib/agent/admin-managed-profile";
import { prisma } from "@/lib/prisma";

/**
 * Prominent reminder for an incomplete profile. Does not redirect or change permissions.
 * Brokerage is read from this workspace only.
 */
export async function ProfessionalProfileNotice({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}) {
  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId, status: "ACTIVE" },
    select: {
      role: true,
      user: {
        select: {
          name: true,
          email: true,
          phone: true,
          agentProfile: {
            select: {
              firstName: true,
              lastName: true,
              phone: true,
              designation: true,
              registrationJurisdiction: true,
              registrationNumber: true,
              recoLicenseNumber: true,
              recoLicenseExpiresAt: true,
            },
          },
        },
      },
    },
  });
  if (!membership) return null;

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      primaryAgentId: true,
      professionalIdentity: {
        select: { brokerageRegisteredName: true, agentDesignation: true },
      },
    },
  });
  const names = splitStaffDisplayName(membership.user.name);
  const profile = membership.user.agentProfile;
  const isRegistered =
    membership.role === "OWNER" || workspace?.primaryAgentId === userId;
  const designation =
    profile?.designation?.trim() ||
    (isRegistered ? workspace?.professionalIdentity?.agentDesignation?.trim() : "") ||
    "";
  const completion = evaluateProfessionalAgentProfile({
    firstName: profile?.firstName?.trim() || names.firstName,
    lastName: profile?.lastName?.trim() || names.lastName,
    email: membership.user.email,
    phone: membership.user.phone || profile?.phone || "",
    designation,
    brokerageName: workspace?.professionalIdentity?.brokerageRegisteredName ?? null,
    jurisdiction: profile?.registrationJurisdiction ?? null,
    recoLicenseNumber: profile?.recoLicenseNumber ?? null,
    recoLicenseExpiresAt: profile?.recoLicenseExpiresAt
      ? profile.recoLicenseExpiresAt.toISOString().slice(0, 10)
      : null,
    registrationNumber: profile?.registrationNumber ?? null,
  });
  if (completion.complete) return null;

  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-semibold">Complete your professional profile</p>
      <p className="mt-1">Still needed: {completion.missingLabels.join(", ")}.</p>
      <Link href="/agent/profile" className="mt-2 inline-block font-semibold underline">
        Update professional profile
      </Link>
    </div>
  );
}
