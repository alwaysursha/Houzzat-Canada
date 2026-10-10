import { NextResponse } from "next/server";
import { handleCustomerConversationMessageContext } from "@/lib/conversations/customer-conversation";
import { isDatabaseUnavailableError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ messageId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { messageId } = await params;
    const result = await handleCustomerConversationMessageContext(
      request,
      messageId,
      { db: prisma },
    );
    return NextResponse.json(result.body, {
      status: result.status,
      headers: result.headers,
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Failed to load" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}
