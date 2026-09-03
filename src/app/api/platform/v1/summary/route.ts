import { getPlatformSummary } from "@/lib/platform/read/summary";
import {
  runPlatformRoute,
} from "@/lib/platform/api/route";

export const runtime = "nodejs";

export async function GET() {
  return runPlatformRoute(() => getPlatformSummary());
}
