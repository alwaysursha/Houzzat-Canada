import { prisma } from "@/lib/prisma";
import { SMS_AUTOMATION_PROTECTION_COPY } from "./constants";
import {
  ensureSmsAutomationCatalog,
  prismaSmsAutomationDb,
  type SmsAutomationDb,
} from "./manage";
import { serializeSmsAutomation } from "./serialize";

export async function listSmsAutomations(db: SmsAutomationDb = prismaSmsAutomationDb(prisma)) {
  await ensureSmsAutomationCatalog(db);
  const definitions = await db.smsAutomationDefinition.findMany({
    orderBy: [{ recipient: "asc" }, { name: "asc" }],
  });
  const items = [];
  for (const definition of definitions) {
    const versions = await db.smsAutomationVersion.findMany({
      where: { definitionId: definition.id },
      orderBy: { versionNumber: "desc" },
    });
    items.push(serializeSmsAutomation(definition, versions));
  }
  return {
    protectionCopy: SMS_AUTOMATION_PROTECTION_COPY,
    items,
  };
}

export async function getSmsAutomationDetail(
  key: string,
  db: SmsAutomationDb = prismaSmsAutomationDb(prisma),
) {
  await ensureSmsAutomationCatalog(db);
  const definition = await db.smsAutomationDefinition.findUnique({
    where: { key },
  });
  if (!definition) return null;
  const versions = await db.smsAutomationVersion.findMany({
    where: { definitionId: definition.id },
    orderBy: { versionNumber: "desc" },
  });
  return {
    protectionCopy: SMS_AUTOMATION_PROTECTION_COPY,
    automation: serializeSmsAutomation(definition, versions),
  };
}
