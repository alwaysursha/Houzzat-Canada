import { readPlatformJsonBody } from "@/lib/platform/api/body";
import { runPlatformRouteWithOperator } from "@/lib/platform/api/route";
import { assignUnpublishedWorkspaceTheme } from "@/lib/platform/templates/assign-unpublished-theme";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

/** MASTER_ADMIN — assign an unpublished theme. Does not open the owner catalog. */
export async function POST(request: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  return runPlatformRouteWithOperator(async (operator) => {
    const body = await readPlatformJsonBody<{ themeId?: unknown }>(request);
    const result = await assignUnpublishedWorkspaceTheme({
      prisma,
      operatorId: operator.operatorId,
      workspaceId,
      themeId: body.themeId,
    });
    return { action: "assign_unpublished_theme", ...result };
  });
}
