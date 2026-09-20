import { PlatformApiError } from "@/lib/platform/api/handler";
import { runPlatformRouteWithOperator } from "@/lib/platform/api/route";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import { prisma } from "@/lib/prisma";
import {
  getSmsAutomationDetail,
  prismaSmsAutomationDb,
  publishSmsAutomation,
} from "@/lib/platform/sms-automations";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ key: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { key: rawKey } = await context.params;
  const key = decodeURIComponent(rawKey);
  return runPlatformRouteWithOperator(async (operator) => {
    const db = prismaSmsAutomationDb(prisma);
    const published = await publishSmsAutomation({
      db,
      key,
      operatorId: operator.operatorId,
      audit: writePlatformAuditEvent,
    });
    const detail = await getSmsAutomationDetail(key, db);
    if (!detail) {
      throw new PlatformApiError("SMS automation not found", 404, "NOT_FOUND");
    }
    return { published: published.version, ...detail };
  });
}
