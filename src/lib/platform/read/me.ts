import type { PlatformOperatorContext } from "@/lib/platform/auth/require-platform-operator";
import { prisma } from "@/lib/prisma";

export async function getPlatformMe(operator: PlatformOperatorContext) {
  const user = await prisma.user.findUnique({
    where: { id: operator.userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
    },
  });

  return {
    operator: {
      id: operator.operatorId,
      role: operator.role,
      status: operator.status,
    },
    user: user
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        }
      : {
          id: operator.userId,
          name: null,
          email: operator.email,
          image: null,
        },
    capabilities: {
      masterAdminReadOnlyV1: true,
      tenantCrmAccess: false,
    },
  };
}
