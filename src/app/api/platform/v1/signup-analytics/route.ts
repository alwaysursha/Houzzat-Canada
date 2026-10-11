import { getSignupAnalyticsReport } from "@/lib/platform/signup-analytics";
import { runPlatformRoute } from "@/lib/platform/api/route";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId");
  const preset = url.searchParams.get("preset");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  return runPlatformRoute(() =>
    getSignupAnalyticsReport({
      workspaceId,
      preset,
      from,
      to,
    }),
  );
}
