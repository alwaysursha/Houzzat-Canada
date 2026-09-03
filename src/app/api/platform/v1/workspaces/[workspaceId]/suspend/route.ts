import { PlatformApiError } from "@/lib/platform/api/handler";
import { runPlatformRouteWithOperator } from "@/lib/platform/api/route";
import { getPlatformWorkspaceDetail } from "@/lib/platform/read/workspaces";
import { suspendWorkspace } from "@/lib/platform/workspaces/status";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  return runPlatformRouteWithOperator(async (operator) => {
    let body: { reason?: unknown };
    try {
      body = (await request.json()) as { reason?: unknown };
    } catch {
      throw new PlatformApiError("Invalid JSON body", 400, "INVALID_BODY");
    }

    const result = await suspendWorkspace({
      workspaceId,
      reason: typeof body.reason === "string" ? body.reason : "",
      operatorId: operator.operatorId,
    });

    const workspace = await getPlatformWorkspaceDetail(workspaceId);
    if (!workspace) {
      throw new PlatformApiError("Workspace not found", 404, "NOT_FOUND");
    }

    return { action: result, workspace };
  });
}
