import { getPlatformMe } from "@/lib/platform/read/me";
import {
  runPlatformRouteWithOperator,
} from "@/lib/platform/api/route";

export const runtime = "nodejs";

export async function GET() {
  return runPlatformRouteWithOperator((operator) => getPlatformMe(operator));
}
