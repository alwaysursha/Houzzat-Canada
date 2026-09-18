import { NextResponse } from "next/server";
import { handleCustomerConversationGet } from "@/lib/conversations/customer-conversation";
import { isDatabaseUnavailableError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const result = await handleCustomerConversationGet(request, { db: prisma });
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
