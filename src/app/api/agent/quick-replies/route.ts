import { NextResponse } from "next/server";
import { isTrustedStaffMutationOriginForRequest } from "@/lib/active-workspace";
import { requireAgentContextFromRequest } from "@/lib/agent";
import {
  AGENT_CHAT_QUICK_REPLY_MAX_PER_AGENT,
  createAgentChatQuickReply,
  listAgentChatQuickReplies,
  parseQuickReplyCreateBody,
  readRequestJsonLimited,
  resolveQuickReplyOwner,
  type AgentChatQuickReplyDb,
} from "@/lib/conversations/agent-chat-quick-replies";
import { isDatabaseUnavailableError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

function db(): AgentChatQuickReplyDb {
  return prisma as unknown as AgentChatQuickReplyDb;
}

export async function GET(request: Request) {
  try {
    const ctx = await requireAgentContextFromRequest(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const owner = resolveQuickReplyOwner(ctx);
    if (!owner.ok) {
      return NextResponse.json(owner.body, { status: owner.status });
    }
    const replies = await listAgentChatQuickReplies(db(), owner);
    return NextResponse.json({ replies });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Failed to load" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!isTrustedStaffMutationOriginForRequest(request)) {
      return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
    }
    const ctx = await requireAgentContextFromRequest(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const owner = resolveQuickReplyOwner(ctx);
    if (!owner.ok) {
      return NextResponse.json(owner.body, { status: owner.status });
    }

    const raw = await readRequestJsonLimited(request);
    if (!raw.ok) {
      return NextResponse.json(raw.body, { status: raw.status });
    }
    const parsed = parseQuickReplyCreateBody(raw.value);
    if (!parsed.ok) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const created = await createAgentChatQuickReply(db(), owner, {
      name: parsed.name,
      body: parsed.body,
    });
    if (!created.ok) {
      return NextResponse.json(
        {
          error: "Quick reply limit reached.",
          code: "QUICK_REPLY_QUOTA",
          max: AGENT_CHAT_QUICK_REPLY_MAX_PER_AGENT,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ reply: created.reply }, { status: 201 });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Failed to create" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}
