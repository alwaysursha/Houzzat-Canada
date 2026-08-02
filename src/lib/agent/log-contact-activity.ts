import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Write a leadActivity on every CRM lead for this customer (Activity tab). */
export async function logContactActivityForCustomer(input: {
  customerId: string;
  type: "contact_update_request" | "contact_updated_by_customer";
  body: string;
  meta?: Prisma.InputJsonValue;
  actorUserId?: string | null;
}) {
  const leads = await prisma.lead.findMany({
    where: { customerId: input.customerId },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });
  if (!leads.length) return { written: 0 };

  await prisma.leadActivity.createMany({
    data: leads.map((lead) => ({
      leadId: lead.id,
      userId: input.actorUserId ?? null,
      type: input.type,
      body: input.body,
      ...(input.meta !== undefined ? { meta: input.meta } : {}),
    })),
  });

  return { written: leads.length };
}
