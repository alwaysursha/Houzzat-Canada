import { PlatformApiError } from "@/lib/platform/api/handler";
import {
  runPlatformRoute,
} from "@/lib/platform/api/route";
import { getPlatformWorkspaceDetail } from "@/lib/platform/read/workspaces";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  return runPlatformRoute(async () => {
    const workspace = await getPlatformWorkspaceDetail(workspaceId);
    if (!workspace) {
      throw new PlatformApiError("Workspace not found", 404, "NOT_FOUND");
    }
    return workspace;
  });
}
