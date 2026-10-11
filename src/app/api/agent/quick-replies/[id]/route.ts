import { NextResponse } from "next/server";
import { isTrustedStaffMutationOriginForRequest } from "@/lib/active-workspace";
import { requireAgentContextFromRequest } from "@/lib/agent";
import {
  deleteAgentChatQuickReply,
  isValidQuickReplyId,
  parseQuickReplyPatchBody,
  readRequestJsonLimited,
  resolveQuickReplyOwner,
  updateAgentChatQuickReply,
  type AgentChatQuickReplyDb,
} from "@/lib/conversations/agent-chat-quick-replies";
import { isDatabaseUnavailableError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

function db(): AgentChatQuickReplyDb {
  return prisma as unknown as AgentChatQuickReplyDb;
}

export async function PATCH(request: Request, { params }: Params) {
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

    const { id } = await params;
    if (!isValidQuickReplyId(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const raw = await readRequestJsonLimited(request);
    if (!raw.ok) {
      return NextResponse.json(raw.body, { status: raw.status });
    }
    const parsed = parseQuickReplyPatchBody(raw.value);
    if (!parsed.ok) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const updated = await updateAgentChatQuickReply(db(), owner, id, {
      name: parsed.name,
      body: parsed.body,
    });
    if (!updated.ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ reply: updated.reply });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Failed to update" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
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

    const { id } = await params;
    if (!isValidQuickReplyId(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const deleted = await deleteAgentChatQuickReply(db(), owner, id);
    if (!deleted.ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Failed to delete" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
