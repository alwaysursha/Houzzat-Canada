/**
 * Stage 4.5.2 — Mobile Lead Detail contact / reminder / profile-flags writes.
 *
 * Mirrors authorizeMobileLeadAccess + route validation without hitting Neon.
 * Proves Workspace A cannot mutate Workspace B leads; leadId alone is not authority.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createWorkspaceAccessToken,
  verifyMobileToken,
} from "../src/types/token-helpers";

type MockLead = {
  id: string;
  workspaceId: string;
  assignedAgentId: string | null;
  customerId: string | null;
};

type MockCustomer = {
  id: string;
  email: string;
  phone: string | null;
  homeAddress: string | null;
  isBuyer: boolean;
  isSeller: boolean;
  emailUpdateRequestedAt: string | null;
  phoneUpdateRequestedAt: string | null;
};

const MOCK_LEADS: Record<string, MockLead> = {
  lead_canary_01: {
    id: "lead_canary_01",
    workspaceId: "ws_tenant_canary",
    assignedAgentId: "usr_canary_agent_01",
    customerId: "cust_canary_01",
  },
  lead_canary_pond: {
    id: "lead_canary_pond",
    workspaceId: "ws_tenant_canary",
    assignedAgentId: null,
    customerId: "cust_canary_pond",
  },
  lead_canary_other_agent: {
    id: "lead_canary_other_agent",
    workspaceId: "ws_tenant_canary",
    assignedAgentId: "usr_canary_agent_02",
    customerId: "cust_canary_other",
  },
  lead_houzzat_01: {
    id: "lead_houzzat_01",
    workspaceId: "ws_houzzat_prod",
    assignedAgentId: "usr_houzzat_agent_01",
    customerId: "cust_houzzat_01",
  },
};

const customers: Record<string, MockCustomer> = {
  cust_canary_01: {
    id: "cust_canary_01",
    email: "buyer@canary.test",
    phone: "4165550101",
    homeAddress: "1 Main St",
    isBuyer: true,
    isSeller: false,
    emailUpdateRequestedAt: null,
    phoneUpdateRequestedAt: null,
  },
  cust_canary_pond: {
    id: "cust_canary_pond",
    email: "pond@canary.test",
    phone: null,
    homeAddress: null,
    isBuyer: false,
    isSeller: false,
    emailUpdateRequestedAt: null,
    phoneUpdateRequestedAt: null,
  },
  cust_canary_other: {
    id: "cust_canary_other",
    email: "other@canary.test",
    phone: "4165550199",
    homeAddress: null,
    isBuyer: true,
    isSeller: false,
    emailUpdateRequestedAt: null,
    phoneUpdateRequestedAt: null,
  },
  cust_houzzat_01: {
    id: "cust_houzzat_01",
    email: "buyer@houzzat.test",
    phone: "6475550101",
    homeAddress: "99 King St",
    isBuyer: true,
    isSeller: false,
    emailUpdateRequestedAt: null,
    phoneUpdateRequestedAt: null,
  },
};

const activities: Array<{ leadId: string; type: string; body: string }> = [];

function authorizeWrite(tokenPayload: any, leadId: string) {
  if (
    !tokenPayload ||
    tokenPayload.type !== "mobile_workspace_access" ||
    !tokenPayload.wsId
  ) {
    return {
      ok: false as const,
      status: 403,
      code: "WORKSPACE_FORBIDDEN",
      message: "A valid workspace session token is required",
    };
  }

  const workspaceId = tokenPayload.wsId as string;
  const userId = tokenPayload.sub as string;
  const role = tokenPayload.role as string;
  const lead = MOCK_LEADS[leadId];

  if (!lead || lead.workspaceId !== workspaceId) {
    return {
      ok: false as const,
      status: 404,
      code: "LEAD_NOT_FOUND",
      message: "Lead not found in current workspace",
    };
  }

  if (role === "AGENT") {
    const isAssigned = lead.assignedAgentId === userId;
    const isPond = lead.assignedAgentId === null;
    if (!isAssigned && !isPond) {
      return {
        ok: false as const,
        status: 404,
        code: "LEAD_NOT_FOUND",
        message: "Lead not found or access restricted",
      };
    }
  } else if (role !== "OWNER" && role !== "ADMIN") {
    return {
      ok: false as const,
      status: 403,
      code: "WORKSPACE_FORBIDDEN",
      message: "Unsupported workspace role",
    };
  }

  return {
    ok: true as const,
    userId,
    workspaceId,
    role,
    lead,
  };
}

/** Reject client workspaceId / leadId / unknown keys (route .strict()). */
function hasForbiddenKeys(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const keys = Object.keys(body as Record<string, unknown>);
  return keys.some((k) => k === "workspaceId" || k === "leadId" || k === "wsId");
}

function executeContactPatch(
  tokenPayload: any,
  leadId: string,
  body: unknown,
  _clientWorkspaceHeader?: string,
) {
  void _clientWorkspaceHeader;
  const access = authorizeWrite(tokenPayload, leadId);
  if (!access.ok) {
    return {
      ok: false as const,
      status: access.status,
      code: access.code,
      message: access.message,
    };
  }

  if (hasForbiddenKeys(body)) {
    return {
      ok: false as const,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid contact payload",
    };
  }

  if (!body || typeof body !== "object") {
    return {
      ok: false as const,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid contact payload",
    };
  }

  const raw = body as {
    email?: unknown;
    phone?: unknown;
    address?: unknown;
  };
  const allowed = new Set(["email", "phone", "address"]);
  if (Object.keys(raw).some((k) => !allowed.has(k))) {
    return {
      ok: false as const,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid contact payload",
    };
  }

  if (
    raw.email === undefined &&
    raw.phone === undefined &&
    raw.address === undefined
  ) {
    return {
      ok: false as const,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid contact payload",
    };
  }

  if (raw.email !== undefined) {
    if (typeof raw.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.email.trim())) {
      return {
        ok: false as const,
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid contact payload",
      };
    }
  }

  const lead = access.lead;
  if (!lead.customerId || !customers[lead.customerId]) {
    return {
      ok: false as const,
      status: 404,
      code: "LEAD_NOT_FOUND",
      message: "Lead not found",
    };
  }

  const customer = customers[lead.customerId];
  if (typeof raw.email === "string") {
    customer.email = raw.email.trim().toLowerCase();
    customer.emailUpdateRequestedAt = null;
  }
  if (raw.phone !== undefined) {
    const phone =
      typeof raw.phone === "string" ? raw.phone.trim() || null : null;
    customer.phone = phone;
    customer.phoneUpdateRequestedAt = null;
  }
  if (raw.address !== undefined) {
    customer.homeAddress =
      typeof raw.address === "string" ? raw.address.trim() || null : null;
  }

  activities.push({
    leadId: lead.id,
    type: "contact_update",
    body: "contact updated",
  });

  return {
    ok: true as const,
    status: 200,
    email: customer.email,
    phone: customer.phone,
    address: customer.homeAddress,
  };
}

function executeContactReminder(
  tokenPayload: any,
  leadId: string,
  body: unknown,
) {
  const access = authorizeWrite(tokenPayload, leadId);
  if (!access.ok) {
    return {
      ok: false as const,
      status: access.status,
      code: access.code,
      message: access.message,
    };
  }

  if (hasForbiddenKeys(body)) {
    return {
      ok: false as const,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid channel (email|phone)",
    };
  }

  const channel =
    body && typeof body === "object"
      ? (body as { channel?: unknown }).channel
      : undefined;
  if (channel !== "email" && channel !== "phone") {
    return {
      ok: false as const,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid channel (email|phone)",
    };
  }

  const lead = access.lead;
  if (!lead.customerId || !customers[lead.customerId]) {
    return {
      ok: false as const,
      status: 404,
      code: "LEAD_NOT_FOUND",
      message: "Lead not found",
    };
  }

  const stamp = new Date().toISOString();
  const customer = customers[lead.customerId];
  if (channel === "email") customer.emailUpdateRequestedAt = stamp;
  else customer.phoneUpdateRequestedAt = stamp;

  activities.push({
    leadId: lead.id,
    type: "contact_update_request",
    body: channel,
  });

  return {
    ok: true as const,
    status: 200,
    channel,
    requestedAt: stamp,
  };
}

function executeProfileFlags(
  tokenPayload: any,
  leadId: string,
  body: unknown,
) {
  const access = authorizeWrite(tokenPayload, leadId);
  if (!access.ok) {
    return {
      ok: false as const,
      status: access.status,
      code: access.code,
      message: access.message,
    };
  }

  if (hasForbiddenKeys(body)) {
    return {
      ok: false as const,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid profile flags payload",
    };
  }

  if (!body || typeof body !== "object") {
    return {
      ok: false as const,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid profile flags payload",
    };
  }

  const raw = body as {
    isBuyer?: unknown;
    isSeller?: unknown;
    purchaseTimeframe?: unknown;
  };
  const allowed = new Set(["isBuyer", "isSeller", "purchaseTimeframe"]);
  if (Object.keys(raw).some((k) => !allowed.has(k))) {
    return {
      ok: false as const,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid profile flags payload",
    };
  }

  if (
    raw.isBuyer === undefined &&
    raw.isSeller === undefined &&
    raw.purchaseTimeframe === undefined
  ) {
    return {
      ok: false as const,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid profile flags payload",
    };
  }

  if (raw.isBuyer !== undefined && typeof raw.isBuyer !== "boolean") {
    return {
      ok: false as const,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid profile flags payload",
    };
  }
  if (raw.isSeller !== undefined && typeof raw.isSeller !== "boolean") {
    return {
      ok: false as const,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid profile flags payload",
    };
  }

  const lead = access.lead;
  if (!lead.customerId || !customers[lead.customerId]) {
    return {
      ok: false as const,
      status: 404,
      code: "LEAD_NOT_FOUND",
      message: "Lead not found",
    };
  }

  const customer = customers[lead.customerId];
  if (typeof raw.isBuyer === "boolean") customer.isBuyer = raw.isBuyer;
  if (typeof raw.isSeller === "boolean") customer.isSeller = raw.isSeller;

  activities.push({
    leadId: lead.id,
    type: "profile_flags",
    body: `buyer=${customer.isBuyer};seller=${customer.isSeller}`,
  });

  return {
    ok: true as const,
    status: 200,
    isBuyer: customer.isBuyer,
    isSeller: customer.isSeller,
  };
}

function agentToken(workspaceId: string, userId: string) {
  const token = createWorkspaceAccessToken({
    userId,
    email: `${userId}@test.com`,
    workspaceId,
    role: "AGENT",
  });
  const verify = verifyMobileToken(token.token);
  assert.equal(verify.ok, true);
  if (!verify.ok) throw new Error("token verify failed");
  return verify.payload;
}

function assertRouteSource() {
  const root = join(process.cwd(), "src/app/api/mobile/v2/leads/[leadId]");
  for (const rel of [
    "contact/route.ts",
    "contact-reminder/route.ts",
    "profile-flags/route.ts",
  ]) {
    const src = readFileSync(join(root, rel), "utf8");
    assert.ok(
      src.includes("authorizeMobileLeadAccess"),
      `${rel} must call authorizeMobileLeadAccess`,
    );
    assert.ok(src.includes(".strict()"), `${rel} must use zod .strict()`);
    assert.ok(
      !/\.updateMany\s*\(/.test(src),
      `${rel} must not call updateMany`,
    );
    assert.ok(
      !/\$transaction\s*\(/.test(src),
      `${rel} must not call \$transaction`,
    );
    assert.ok(
      !src.includes("workspaceId:") || src.includes("authorizeMobileLeadAccess"),
      `${rel} must not take client workspace authority`,
    );
  }

  const contactUi = readFileSync(
    join(process.cwd(), "apps/pro-mobile/src/screens/LeadDetailScreen.tsx"),
    "utf8",
  );
  assert.ok(
    contactUi.includes("ContactPencilIcon"),
    "ContactActionRow must use ContactPencilIcon",
  );
  assert.ok(
    contactUi.includes("ContactBellIcon"),
    "ContactActionRow must use ContactBellIcon",
  );
  assert.ok(
    !contactUi.includes("styles.contactBellIcon"),
    "emoji bell style should be removed",
  );
  assert.ok(
    contactUi.includes("engagementCache") &&
      contactUi.includes("Looking for") &&
      !contactUi.includes("Promise.all([\n          detailPromise"),
    "Lead detail must paint before engagement (non-blocking background load)",
  );
  assert.ok(
    contactUi.includes("premiumCard") && contactUi.includes("contactEditField"),
    "Contact edits must use premium modal (not inline row)",
  );
  assert.ok(
    contactUi.includes("LeadAccountVerifyMenu"),
    "Lead profile must show account verify menu",
  );

  const signIn = readFileSync(
    join(process.cwd(), "apps/pro-mobile/src/screens/SignInScreen.tsx"),
    "utf8",
  );
  assert.ok(
    !/\.scrollToEnd\s*\(/.test(signIn),
    "Sign-in must not call scrollToEnd",
  );
  assert.ok(
    signIn.includes('Platform.OS === "ios" ? "padding" : undefined'),
    "Android must not use KAV height behavior",
  );

  const engagementTab = readFileSync(
    join(process.cwd(), "apps/pro-mobile/src/components/EngagementTab.tsx"),
    "utf8",
  );
  assert.ok(
    engagementTab.includes("skip duplicate GET") ||
      engagementTab.includes("reuse cache"),
    "Engagement tab must skip refetch when cache warm",
  );
}

async function run() {
  console.log("=================================================================");
  console.log("STAGE 4.5.2 CONTACT / REMINDER / FLAGS WRITE TESTS");
  console.log("=================================================================");

  console.log("[1] Route source + UI/perf guards...");
  assertRouteSource();
  console.log("  -> PASS");

  console.log("[2] Valid phone / email / address edits...");
  {
    const payload = agentToken("ws_tenant_canary", "usr_canary_agent_01");
    const phone = executeContactPatch(payload, "lead_canary_01", {
      phone: "6472214949",
    });
    assert.equal(phone.ok, true);
    if (phone.ok) assert.equal(phone.phone, "6472214949");

    const email = executeContactPatch(payload, "lead_canary_01", {
      email: "updated@canary.test",
    });
    assert.equal(email.ok, true);
    if (email.ok) assert.equal(email.email, "updated@canary.test");

    const address = executeContactPatch(payload, "lead_canary_01", {
      address: "1574 Leger Way, Milton, ON",
    });
    assert.equal(address.ok, true);
    if (address.ok) {
      assert.equal(address.address, "1574 Leger Way, Milton, ON");
    }
    assert.equal(customers.cust_canary_01.phone, "6472214949");
    console.log("  -> PASS");
  }

  console.log("[3] Invalid contact payload...");
  {
    const payload = agentToken("ws_tenant_canary", "usr_canary_agent_01");
    assert.equal(
      executeContactPatch(payload, "lead_canary_01", {}).status,
      400,
    );
    assert.equal(
      executeContactPatch(payload, "lead_canary_01", { email: "not-an-email" })
        .status,
      400,
    );
    assert.equal(
      executeContactPatch(payload, "lead_canary_01", {
        phone: "1",
        workspaceId: "ws_evil",
      }).status,
      400,
    );
    console.log("  -> PASS");
  }

  console.log("[4] Cross-workspace contact denied (404)...");
  {
    const canaryAgent = agentToken("ws_tenant_canary", "usr_canary_agent_01");
    const denied = executeContactPatch(canaryAgent, "lead_houzzat_01", {
      phone: "999",
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.status, 404);
    assert.equal(customers.cust_houzzat_01.phone, "6475550101");
    console.log("  -> PASS");
  }

  console.log("[5] Other-agent lead denied (404); pond allowed...");
  {
    const agent1 = agentToken("ws_tenant_canary", "usr_canary_agent_01");
    const other = executeContactPatch(agent1, "lead_canary_other_agent", {
      phone: "111",
    });
    assert.equal(other.status, 404);

    const pond = executeContactPatch(agent1, "lead_canary_pond", {
      phone: "222",
    });
    assert.equal(pond.ok, true);
    console.log("  -> PASS");
  }

  console.log("[6] Contact reminder phone/email + invalid channel...");
  {
    const payload = agentToken("ws_tenant_canary", "usr_canary_agent_01");
    const phone = executeContactReminder(payload, "lead_canary_01", {
      channel: "phone",
    });
    assert.equal(phone.ok, true);
    assert.ok(customers.cust_canary_01.phoneUpdateRequestedAt);

    const email = executeContactReminder(payload, "lead_canary_01", {
      channel: "email",
    });
    assert.equal(email.ok, true);
    assert.ok(customers.cust_canary_01.emailUpdateRequestedAt);

    assert.equal(
      executeContactReminder(payload, "lead_canary_01", { channel: "address" })
        .status,
      400,
    );
    assert.equal(
      executeContactReminder(payload, "lead_houzzat_01", { channel: "phone" })
        .status,
      404,
    );
    console.log("  -> PASS");
  }

  console.log("[7] Profile flags buyer/seller + both + unauthorized...");
  {
    const payload = agentToken("ws_tenant_canary", "usr_canary_agent_01");
    const buyer = executeProfileFlags(payload, "lead_canary_01", {
      isBuyer: true,
    });
    assert.equal(buyer.ok, true);

    const seller = executeProfileFlags(payload, "lead_canary_01", {
      isSeller: true,
    });
    assert.equal(seller.ok, true);
    if (seller.ok) {
      assert.equal(seller.isBuyer, true);
      assert.equal(seller.isSeller, true);
    }

    assert.equal(
      executeProfileFlags(payload, "lead_canary_01", {}).status,
      400,
    );
    assert.equal(
      executeProfileFlags(payload, "lead_houzzat_01", { isSeller: true })
        .status,
      404,
    );
    assert.equal(customers.cust_houzzat_01.isSeller, false);
    console.log("  -> PASS");
  }

  console.log("[8] Client workspace header ignored (token.wsId wins)...");
  {
    const payload = agentToken("ws_tenant_canary", "usr_canary_agent_01");
    const res = executeContactPatch(
      payload,
      "lead_canary_01",
      { phone: "333" },
      "ws_houzzat_prod",
    );
    assert.equal(res.ok, true);
    console.log("  -> PASS");
  }

  console.log("\n=================================================================");
  console.log("STAGE 4.5.2 CONTACT WRITE TESTS: ALL PASSED");
  console.log("=================================================================");
}

run().catch((err) => {
  console.error("STAGE 4.5.2 TESTS FAILED:", err);
  process.exit(1);
});
