import type { SubscriptionSource } from "@prisma/client";
import { parsePlatformListParams } from "@/lib/platform/api/pagination";
import {
  runPlatformRoute,
} from "@/lib/platform/api/route";
import { listPlatformSubscriptionsFiltered } from "@/lib/platform/read/subscriptions";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = parsePlatformListParams(url.searchParams);
  const source = url.searchParams.get("source") as SubscriptionSource | null;
  const workspaceId = url.searchParams.get("workspaceId");

  return runPlatformRoute(() =>
    listPlatformSubscriptionsFiltered({
      ...params,
      source,
      workspaceId,
    }),
  );
}
