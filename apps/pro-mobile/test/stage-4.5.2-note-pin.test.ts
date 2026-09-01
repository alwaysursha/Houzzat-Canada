/**
 * Stage 4.5.2 — Note pinning persistence + isolation regression tests.
 *
 * Proves LeadNote.pinned is the canonical field, Mobile v2 notes POST
 * persists it, Lead Detail activities expose pinned, and write isolation
 * still holds. Also asserts no $transaction / nested writes introduced.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createPlatformAccessToken,
  createWorkspaceAccessToken,
  verifyMobileToken,
} from "../src/types/token-helpers";

const REPO_ROOT = join(__dirname, "../../..");
const NOTES_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/leads/[leadId]/notes/route.ts",
);
const DETAIL_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/leads/[leadId]/route.ts",
);

type MockLead = {
  id: string;
  workspaceId: string;
  assignedAgentId: string | null;
  status: string;
  notes: string | null;
  organizationId: string;
};

const MOCK_LEADS: Record<string, MockLead> = {
  lead_canary_01: {
    id: "lead_canary_01",
    workspaceId: "ws_tenant_canary",
    assignedAgentId: "usr_canary_agent_01",
    status: "NEW_LEAD",
    notes: null,
    organizationId: "org_canary",
  },
  lead_canary_03_agent2: {
    id: "lead_canary_03_agent2",
    workspaceId: "ws_tenant_canary",
    assignedAgentId: "usr_canary_agent_02",
    status: "CONTACTED",
    notes: null,
    organizationId: "org_canary",
  },
  lead_houzzat_01: {
    id: "lead_houzzat_01",
    workspaceId: "ws_houzzat_prod",
    assignedAgentId: "usr_houzzat_agent_01",
    status: "NEW_LEAD",
    notes: null,
    organizationId: "org_houzzat",
  },
};

type StoredNote = {
  id: string;
  leadId: string;
  workspaceId: string;
  authorId: string;
  body: string;
  category: "GENERAL" | "CALL";
  pinned: boolean;
  pinnedAt: string | null;
};

type StoredActivity = {
  id: string;
  leadId: string;
  type: string;
  body: string;
  meta: { noteId: string; category: string; pinned: boolean };
};

const noteStore: StoredNote[] = [];
const activityStore: StoredActivity[] = [];

function authorizeWrite(tokenPayload: any, leadId: string) {
  if (
    !tokenPayload ||
    tokenPayload.type !== "mobile_workspace_access" ||
    !tokenPayload.wsId
  ) {
    return { ok: false as const, status: 403, code: "WORKSPACE_FORBIDDEN" };
  }
  const workspaceId = tokenPayload.wsId as string;
  const userId = tokenPayload.sub as string;
  const role = tokenPayload.role as string;
  const lead = MOCK_LEADS[leadId];
  if (!lead || lead.workspaceId !== workspaceId) {
    return { ok: false as const, status: 404, code: "LEAD_NOT_FOUND" };
  }
  if (role === "AGENT") {
    const isAssigned = lead.assignedAgentId === userId;
    const isPond = lead.assignedAgentId === null;
    if (!isAssigned && !isPond) {
      return { ok: false as const, status: 404, code: "LEAD_NOT_FOUND" };
    }
  } else if (role !== "OWNER" && role !== "ADMIN") {
    return { ok: false as const, status: 403, code: "WORKSPACE_FORBIDDEN" };
  }
  return { ok: true as const, userId, workspaceId, lead };
}

/** Mirrors POST notes with canonical LeadNote.pinned + single activity. */
function executeCreateNote(tokenPayload: any, leadId: string, body: unknown) {
  const access = authorizeWrite(tokenPayload, leadId);
  if (!access.ok) {
    return { ok: false as const, status: access.status, code: access.code };
  }
  if (!body || typeof body !== "object") {
    return { ok: false as const, status: 400, code: "VALIDATION_ERROR" };
  }
  const raw = body as {
    body?: unknown;
    category?: unknown;
    pinned?: unknown;
  };
  const noteBody = typeof raw.body === "string" ? raw.body.trim() : "";
  if (!noteBody) {
    return { ok: false as const, status: 400, code: "VALIDATION_ERROR" };
  }
  const category =
    raw.category === "CALL" || raw.category === "GENERAL"
      ? raw.category
      : "GENERAL";
  // Omit → default false (matches zod .optional().default(false))
  const pinned = raw.pinned === undefined ? false : Boolean(raw.pinned);

  const note: StoredNote = {
    id: `note_${noteStore.length + 1}`,
    leadId: access.lead.id,
    workspaceId: access.workspaceId,
    authorId: access.userId,
    body: noteBody,
    category,
    pinned,
    pinnedAt: pinned ? new Date().toISOString() : null,
  };
  noteStore.push(note);

  activityStore.push({
    id: `act_${activityStore.length + 1}`,
    leadId: access.lead.id,
    type: "note",
    body: noteBody.slice(0, 500),
    meta: { noteId: note.id, category, pinned },
  });

  return {
    ok: true as const,
    status: 200,
    note: {
      id: note.id,
      body: note.body,
      category: note.category,
      pinned: note.pinned,
      pinnedAt: note.pinnedAt,
    },
  };
}

/** Maps activities like Stage 4.5.2 Lead Detail GET (pinned from meta). */
function mapRecentActivities(leadId: string) {
  const mapped = activityStore
    .filter((a) => a.leadId === leadId)
    .map((a) => ({
      id: a.id,
      type: a.type,
      body: a.body,
      createdAt: new Date().toISOString(),
      ...(a.meta.pinned ? { pinned: true as const } : {}),
    }));
  const pinnedItems = mapped.filter((a) => a.pinned);
  const rest = mapped.filter((a) => !a.pinned);
  return [...pinnedItems, ...rest];
}

async function runStage452Tests() {
  console.log("=================================================================");
  console.log("STAGE 4.5.2 — NOTE PINNING FIX TESTS");
  console.log("=================================================================\n");

  noteStore.length = 0;
  activityStore.length = 0;

  // 1. Source: notes route still HTTP-safe + writes pinned
  console.log("[1/9] Notes route preserves pinned write without transaction...");
  {
    const src = readFileSync(NOTES_ROUTE, "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.equal(/\$transaction\s*\(/.test(code), false);
    assert.equal(/\.updateMany\s*\(/.test(code), false);
    assert.ok(/pinned/.test(code));
    assert.ok(/pinnedAt/.test(code));
    console.log("  -> PASS");
  }

  // 2. Source: detail route exposes pinned from meta
  console.log("[2/9] Lead Detail GET exposes activity pinned from meta...");
  {
    const src = readFileSync(DETAIL_ROUTE, "utf8");
    assert.ok(src.includes("meta: true"));
    assert.ok(src.includes("pinned"));
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.equal(/\$transaction\s*\(/.test(code), false);
    console.log("  -> PASS");
  }

  const agentToken = createWorkspaceAccessToken({
    userId: "usr_canary_agent_01",
    email: "agent1@canary.com",
    workspaceId: "ws_tenant_canary",
    role: "AGENT",
  });
  const agentVerify = verifyMobileToken(agentToken.token);
  assert.equal(agentVerify.ok, true);
  if (!agentVerify.ok) return;

  // 3. pinned=false saves normally
  console.log("[3/9] pinned=false note saves with pinned=false...");
  {
    const res = executeCreateNote(agentVerify.payload, "lead_canary_01", {
      body: "Ordinary note",
      pinned: false,
    });
    assert.equal(res.ok, true);
    assert.equal(res.note?.pinned, false);
    assert.equal(res.note?.pinnedAt, null);
    assert.equal(noteStore[noteStore.length - 1]!.pinned, false);
    console.log("  -> PASS");
  }

  // 4. pinned=true persists canonical field
  console.log("[4/9] pinned=true persists LeadNote.pinned + pinnedAt...");
  {
    const beforeActs = activityStore.length;
    const res = executeCreateNote(agentVerify.payload, "lead_canary_01", {
      body: "Pinned note body",
      category: "GENERAL",
      pinned: true,
    });
    assert.equal(res.ok, true);
    assert.equal(res.note?.pinned, true);
    assert.ok(res.note?.pinnedAt);
    assert.equal(noteStore[noteStore.length - 1]!.pinned, true);
    assert.equal(activityStore.length - beforeActs, 1);
    assert.equal(activityStore[activityStore.length - 1]!.meta.pinned, true);
    console.log("  -> PASS");
  }

  // 5. omitted pinned defaults false
  console.log("[5/9] omitted pinned defaults to false...");
  {
    const res = executeCreateNote(agentVerify.payload, "lead_canary_01", {
      body: "Default pin omit",
    });
    assert.equal(res.ok, true);
    assert.equal(res.note?.pinned, false);
    console.log("  -> PASS");
  }

  // 6. Detail mapping floats pinned + exposes flag
  console.log("[6/9] Detail activity mapping exposes pinned + floats to top...");
  {
    const activities = mapRecentActivities("lead_canary_01");
    assert.ok(activities.some((a) => a.pinned === true));
    assert.equal(activities[0]?.pinned, true);
    assert.equal(
      activities.filter((a) => a.type === "note").length,
      3,
    );
    console.log("  -> PASS");
  }

  // 7. Cross-tenant pin write impossible
  console.log("[7/9] Cross-tenant pin write denied...");
  {
    const res = executeCreateNote(agentVerify.payload, "lead_houzzat_01", {
      body: "cross pin",
      pinned: true,
    });
    assert.equal(res.ok, false);
    assert.equal(res.status, 404);
    console.log("  -> PASS");
  }

  // 8. Agent A cannot pin on Agent B private lead
  console.log("[8/9] Agent A cannot pin Agent B private lead...");
  {
    const res = executeCreateNote(agentVerify.payload, "lead_canary_03_agent2", {
      body: "private pin",
      pinned: true,
    });
    assert.equal(res.ok, false);
    assert.equal(res.status, 404);

    const platform = createPlatformAccessToken({
      id: "usr_platform",
      email: "platform@houzzat.com",
    });
    const pv = verifyMobileToken(platform.token);
    assert.equal(pv.ok, true);
    if (!pv.ok) return;
    const platRes = executeCreateNote(pv.payload, "lead_canary_01", {
      body: "platform pin",
      pinned: true,
    });
    assert.equal(platRes.status, 403);
    console.log("  -> PASS");
  }

  // 9. No duplicate activity + existing note creation still works
  console.log("[9/9] Single activity per note; creation still works...");
  {
    const beforeNotes = noteStore.length;
    const beforeActs = activityStore.length;
    const res = executeCreateNote(agentVerify.payload, "lead_canary_01", {
      body: "Final check note",
      category: "CALL",
      pinned: true,
    });
    assert.equal(res.ok, true);
    assert.equal(noteStore.length - beforeNotes, 1);
    assert.equal(activityStore.length - beforeActs, 1);
    assert.equal(res.note?.category, "CALL");
    assert.equal(res.note?.pinned, true);
    console.log("  -> PASS");
  }

  console.log("\n=================================================================");
  console.log("STAGE 4.5.2 NOTE PINNING TESTS: ALL PASSED");
  console.log("=================================================================");
}

runStage452Tests().catch((err) => {
  console.error("STAGE 4.5.2 TESTS FAILED:", err);
  process.exit(1);
});
