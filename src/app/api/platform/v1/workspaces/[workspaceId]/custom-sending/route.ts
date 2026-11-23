import { CustomSendingError } from "@/lib/email/custom-sending-policy";
import { runPlatformRouteWithOperator } from "@/lib/platform/api/route";
import {
  checkCustomSending,
  inspectCustomSending,
  prepareCustomSending,
  sendCustomSendingTest,
  setCustomSendingEnabled,
} from "@/lib/platform/email/master-custom-sending";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ workspaceId: string }> };

type Body = {
  action?: unknown;
  sendingDomain?: unknown;
  returnPathHost?: unknown;
  senderDisplayName?: unknown;
  fromEmail?: unknown;
  replyToEmail?: unknown;
  to?: unknown;
};

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** MASTER_ADMIN — read custom sending configuration. Does not send or enable. */
export async function GET(_request: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  return runPlatformRouteWithOperator(async () =>
    inspectCustomSending({ prisma, workspaceId }),
  );
}

/** MASTER_ADMIN — prepare, check, enable, or test custom sending. */
export async function POST(request: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  const body = (await request.json().catch(() => null)) as Body | null;
  const action = text(body?.action);
  return runPlatformRouteWithOperator(async (operator) => {
    switch (action) {
      case "prepare":
        return prepareCustomSending({
          prisma,
          operatorId: operator.operatorId,
          workspaceId,
          request: {
            sendingDomain: text(body?.sendingDomain),
            returnPathHost: text(body?.returnPathHost),
            senderDisplayName: text(body?.senderDisplayName),
            fromEmail: text(body?.fromEmail),
            replyToEmail: text(body?.replyToEmail),
          },
        });
      case "check":
        return checkCustomSending({
          prisma,
          operatorId: operator.operatorId,
          workspaceId,
        });
      case "enable":
        return setCustomSendingEnabled({
          prisma,
          operatorId: operator.operatorId,
          workspaceId,
          enabled: true,
        });
      case "disable":
        return setCustomSendingEnabled({
          prisma,
          operatorId: operator.operatorId,
          workspaceId,
          enabled: false,
        });
      case "test":
        return sendCustomSendingTest({
          prisma,
          operatorId: operator.operatorId,
          workspaceId,
          to: text(body?.to),
        });
      default:
        throw new CustomSendingError("Choose a custom sending action.", "UNKNOWN_ACTION");
    }
  });
}
