import { readPlatformJsonBody } from "@/lib/platform/api/body";
import { runPlatformRouteWithOperator } from "@/lib/platform/api/route";
import { reactivateWorkspace } from "@/lib/platform/workspaces/status";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  return runPlatformRouteWithOperator(async (operator) => {
    const body = await readPlatformJsonBody<{ reason?: unknown }>(request);

    const result = await reactivateWorkspace({
      workspaceId,
      reason: typeof body.reason === "string" ? body.reason : null,
      operatorId: operator.operatorId,
    });

    return { action: result };
  });
}
