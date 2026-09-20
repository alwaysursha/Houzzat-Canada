import { runPlatformRoute, runPlatformRouteWithOperator } from "@/lib/platform/api/route";
import { readPlatformJsonBody } from "@/lib/platform/api/body";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import {
  createSmsQuickText,
  listSmsQuickTexts,
  prismaSmsQuickTextDb,
  reorderSmsQuickTexts,
} from "@/lib/platform/sms-quick-texts";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function db() {
  return prismaSmsQuickTextDb(prisma);
}

export async function GET() {
  return runPlatformRoute(() => listSmsQuickTexts(db()));
}

export async function POST(request: Request) {
  return runPlatformRouteWithOperator(async (operator) => {
    const body = await readPlatformJsonBody<Record<string, unknown>>(request);
    if (Array.isArray(body.ids)) {
      const ids = body.ids.filter((id): id is string => typeof id === "string");
      await reorderSmsQuickTexts({
        db: db(),
        operatorId: operator.operatorId,
        ids,
        audit: writePlatformAuditEvent,
      });
      return listSmsQuickTexts(db());
    }
    await createSmsQuickText({
      db: db(),
      operatorId: operator.operatorId,
      name: typeof body.name === "string" ? body.name : "",
      category: typeof body.category === "string" ? body.category : "",
      body: typeof body.body === "string" ? body.body : "",
      active: typeof body.active === "boolean" ? body.active : undefined,
      audit: writePlatformAuditEvent,
    });
    return listSmsQuickTexts(db());
  });
}
