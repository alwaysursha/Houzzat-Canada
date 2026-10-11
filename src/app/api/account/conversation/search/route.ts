import { NextResponse } from "next/server";
import { handleCustomerConversationSearch } from "@/lib/conversations/customer-conversation";
import { isDatabaseUnavailableError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const result = await handleCustomerConversationSearch(request, {
      db: prisma,
    });
    return NextResponse.json(result.body, {
      status: result.status,
      headers: result.headers,
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Failed to search" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to search" }, { status: 500 });
  }
}
