import { PlatformApiError } from "@/lib/platform/api/handler";
import { readPlatformJsonBody } from "@/lib/platform/api/body";
import { runPlatformRouteWithOperator } from "@/lib/platform/api/route";
import {
  getSmsQuickText,
  previewSmsQuickText,
  prismaSmsQuickTextDb,
} from "@/lib/platform/sms-quick-texts";
import { prisma } from "@/lib/prisma";
import type { SmsTemplatePreviewContext } from "@/lib/platform/sms-automations/variables";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id: rawId } = await context.params;
  const id = decodeURIComponent(rawId);
  return runPlatformRouteWithOperator(async () => {
    const body = await readPlatformJsonBody<Record<string, unknown>>(request);
    const detail = await getSmsQuickText(prismaSmsQuickTextDb(prisma), id);
    if (!detail) {
      throw new PlatformApiError("Quick Text not found", 404, "NOT_FOUND");
    }
    const sourceBody =
      typeof body.body === "string" ? body.body : detail.item.body;
    const context =
      body.context && typeof body.context === "object" && !Array.isArray(body.context)
        ? (body.context as SmsTemplatePreviewContext)
        : undefined;
    return previewSmsQuickText({
      body: sourceBody,
      allowedVariables: detail.item.allowedVariables,
      context,
    });
  });
}
