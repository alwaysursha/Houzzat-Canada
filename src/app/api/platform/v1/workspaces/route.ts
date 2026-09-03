import { parsePlatformListParams } from "@/lib/platform/api/pagination";
import {
  runPlatformRoute,
} from "@/lib/platform/api/route";
import { listPlatformWorkspaces } from "@/lib/platform/read/workspaces";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = parsePlatformListParams(new URL(request.url).searchParams);
  return runPlatformRoute(() => listPlatformWorkspaces(params));
}
