import { PlatformApiError } from "@/lib/platform/api/handler";
import { readPlatformJsonBody } from "@/lib/platform/api/body";
import { runPlatformRouteWithOperator } from "@/lib/platform/api/route";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import { prisma } from "@/lib/prisma";
import {
  getSmsAutomationDetail,
  prismaSmsAutomationDb,
  rollbackSmsAutomation,
} from "@/lib/platform/sms-automations";
import { SmsAutomationActionError } from "@/lib/platform/sms-automations/errors";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ key: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { key: rawKey } = await context.params;
  const key = decodeURIComponent(rawKey);
  return runPlatformRouteWithOperator(async (operator) => {
    const body = await readPlatformJsonBody<Record<string, unknown>>(request);
    const versionId =
      typeof body.versionId === "string" ? body.versionId.trim() : "";
    if (!versionId) {
      throw new SmsAutomationActionError(
        "versionId is required.",
        "VERSION_REQUIRED",
      );
    }
    const db = prismaSmsAutomationDb(prisma);
    const rolled = await rollbackSmsAutomation({
      db,
      key,
      operatorId: operator.operatorId,
      versionId,
      audit: writePlatformAuditEvent,
    });
    const detail = await getSmsAutomationDetail(key, db);
    if (!detail) {
      throw new PlatformApiError("SMS automation not found", 404, "NOT_FOUND");
    }
    return { rolledBack: rolled.version, ...detail };
  });
}
