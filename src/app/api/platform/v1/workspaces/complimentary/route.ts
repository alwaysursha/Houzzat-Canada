import { readPlatformJsonBody } from "@/lib/platform/api/body";
import { runPlatformRouteWithOperator } from "@/lib/platform/api/route";
import { provisionComplimentaryWorkspace } from "@/lib/platform/provisioning/complimentary";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** MASTER_ADMIN — provision one complimentary ACTIVE workspace. Does not send email. */
export async function POST(request: Request) {
  return runPlatformRouteWithOperator(async (operator) => {
    const body = await readPlatformJsonBody<{
      authorization?: unknown;
      slug?: unknown;
      displayName?: unknown;
      ownerName?: unknown;
      ownerEmail?: unknown;
      ownerPhone?: unknown;
      brokerageName?: unknown;
      planCode?: unknown;
      themeId?: unknown;
    }>(request);

    const result = await provisionComplimentaryWorkspace({
      prisma,
      operatorId: operator.operatorId,
      authorization: typeof body.authorization === "string" ? body.authorization : "",
      slug: typeof body.slug === "string" ? body.slug : "",
      displayName: typeof body.displayName === "string" ? body.displayName : "",
      ownerName: typeof body.ownerName === "string" ? body.ownerName : "",
      ownerEmail: typeof body.ownerEmail === "string" ? body.ownerEmail : "",
      ownerPhone: typeof body.ownerPhone === "string" ? body.ownerPhone : "",
      brokerageName: typeof body.brokerageName === "string" ? body.brokerageName : "",
      planCode: typeof body.planCode === "string" ? body.planCode : "",
      themeId: typeof body.themeId === "string" ? body.themeId : null,
    });

    return { action: "provision_complimentary_workspace", ...result };
  });
}
