import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function requireCustomerUser() {
  const session = await auth();
  if (!session?.user?.id && !session?.user?.email) {
    return null;
  }

  const user = await prisma.user.findFirst({
    where: session.user.id
      ? { id: session.user.id }
      : { email: session.user.email },
  });

  return user;
}
