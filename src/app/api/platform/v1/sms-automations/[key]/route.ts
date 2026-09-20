import { PlatformApiError } from "@/lib/platform/api/handler";
import { readPlatformJsonBody } from "@/lib/platform/api/body";
import {
  runPlatformRoute,
  runPlatformRouteWithOperator,
} from "@/lib/platform/api/route";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import { prisma } from "@/lib/prisma";
import {
  getSmsAutomationDetail,
  prismaSmsAutomationDb,
  saveSmsAutomationDraft,
  setSmsAutomationActive,
} from "@/lib/platform/sms-automations";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ key: string }>;
};

function db() {
  return prismaSmsAutomationDb(prisma);
}

export async function GET(_request: Request, context: RouteContext) {
  const { key } = await context.params;
  return runPlatformRoute(async () => {
    const detail = await getSmsAutomationDetail(decodeURIComponent(key));
    if (!detail) {
      throw new PlatformApiError("SMS automation not found", 404, "NOT_FOUND");
    }
    return detail;
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { key: rawKey } = await context.params;
  const key = decodeURIComponent(rawKey);
  return runPlatformRouteWithOperator(async (operator) => {
    const body = await readPlatformJsonBody<Record<string, unknown>>(request);
    const prismaDb = db();

    if (typeof body.active === "boolean") {
      await setSmsAutomationActive({
        db: prismaDb,
        key,
        operatorId: operator.operatorId,
        active: body.active,
        audit: writePlatformAuditEvent,
      });
    }

    const shouldSaveDraft =
      typeof body.body === "string" ||
      typeof body.name === "string" ||
      body.delayMinutes !== undefined;

    if (shouldSaveDraft) {
      await saveSmsAutomationDraft({
        db: prismaDb,
        key,
        operatorId: operator.operatorId,
        body: typeof body.body === "string" ? body.body : undefined,
        delayMinutes:
          typeof body.delayMinutes === "number" || body.delayMinutes === null
            ? body.delayMinutes
            : undefined,
        name: typeof body.name === "string" ? body.name : undefined,
        audit: writePlatformAuditEvent,
      });
    }

    const detail = await getSmsAutomationDetail(key, prismaDb);
    if (!detail) {
      throw new PlatformApiError("SMS automation not found", 404, "NOT_FOUND");
    }
    return detail;
  });
}
