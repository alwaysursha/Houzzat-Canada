import { runPlatformRoute } from "@/lib/platform/api/route";
import { listSmsAutomations } from "@/lib/platform/sms-automations";

export const runtime = "nodejs";

export async function GET() {
  return runPlatformRoute(() => listSmsAutomations());
}
