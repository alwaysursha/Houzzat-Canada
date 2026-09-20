import { PlatformApiError } from "@/lib/platform/api/handler";
import { readPlatformJsonBody } from "@/lib/platform/api/body";
import { runPlatformRouteWithOperator } from "@/lib/platform/api/route";
import { prisma } from "@/lib/prisma";
import {
  getSmsAutomationDetail,
  previewSmsAutomationTemplate,
  prismaSmsAutomationDb,
} from "@/lib/platform/sms-automations";
import type { SmsTemplatePreviewContext } from "@/lib/platform/sms-automations/variables";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ key: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { key: rawKey } = await context.params;
  const key = decodeURIComponent(rawKey);
  return runPlatformRouteWithOperator(async () => {
    const body = await readPlatformJsonBody<Record<string, unknown>>(request);
    const detail = await getSmsAutomationDetail(
      key,
      prismaSmsAutomationDb(prisma),
    );
    if (!detail) {
      throw new PlatformApiError("SMS automation not found", 404, "NOT_FOUND");
    }
    const sourceBody =
      typeof body.body === "string"
        ? body.body
        : (detail.automation.draftVersion?.body ??
          detail.automation.publishedVersion?.body ??
          "");
    const context =
      body.context && typeof body.context === "object" && !Array.isArray(body.context)
        ? (body.context as SmsTemplatePreviewContext)
        : undefined;
    const preview = previewSmsAutomationTemplate({
      body: sourceBody,
      allowedVariables: detail.automation.allowedVariables,
      context,
    });
    return {
      ...preview,
      body: sourceBody,
      from: typeof body.body === "string" ? "request" : detail.automation.draftVersion
        ? "draft"
        : "published",
    };
  });
}
