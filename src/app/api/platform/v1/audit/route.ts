import { parsePlatformListParams } from "@/lib/platform/api/pagination";
import {
  runPlatformRoute,
} from "@/lib/platform/api/route";
import { listPlatformAuditEvents } from "@/lib/platform/read/audit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = parsePlatformListParams(url.searchParams);
  const entityType = url.searchParams.get("entityType");
  const action = url.searchParams.get("action");

  return runPlatformRoute(() =>
    listPlatformAuditEvents({
      ...params,
      entityType,
      action,
    }),
  );
}
