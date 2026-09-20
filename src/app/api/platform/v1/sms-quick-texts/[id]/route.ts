import { PlatformApiError } from "@/lib/platform/api/handler";
import { readPlatformJsonBody } from "@/lib/platform/api/body";
import {
  runPlatformRoute,
  runPlatformRouteWithOperator,
} from "@/lib/platform/api/route";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import {
  getSmsQuickText,
  prismaSmsQuickTextDb,
  updateSmsQuickText,
} from "@/lib/platform/sms-quick-texts";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function db() {
  return prismaSmsQuickTextDb(prisma);
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return runPlatformRoute(async () => {
    const detail = await getSmsQuickText(db(), decodeURIComponent(id));
    if (!detail) {
      throw new PlatformApiError("Quick Text not found", 404, "NOT_FOUND");
    }
    return detail;
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id: rawId } = await context.params;
  const id = decodeURIComponent(rawId);
  return runPlatformRouteWithOperator(async (operator) => {
    const body = await readPlatformJsonBody<Record<string, unknown>>(request);
    await updateSmsQuickText({
      db: db(),
      operatorId: operator.operatorId,
      id,
      name: typeof body.name === "string" ? body.name : undefined,
      category: typeof body.category === "string" ? body.category : undefined,
      body: typeof body.body === "string" ? body.body : undefined,
      active: typeof body.active === "boolean" ? body.active : undefined,
      audit: writePlatformAuditEvent,
    });
    const detail = await getSmsQuickText(db(), id);
    if (!detail) {
      throw new PlatformApiError("Quick Text not found", 404, "NOT_FOUND");
    }
    return detail;
  });
}
