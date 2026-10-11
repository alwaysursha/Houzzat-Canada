/**
 * Chat V1 Milestone 4X — agent Share Property picker UI (no DB).
 * Run: pnpm agent-chat-listing-share-ui:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_LISTING_SHARE_SEARCH_LIMIT,
  AGENT_LISTING_SHARE_SEARCH_MAX_Q,
  AGENT_LISTING_SHARE_SEARCH_MIN_Q,
  parseAgentListingShareSearchQuery,
  searchAgentListingSharePicker,
  type AgentListingShareSearchDb,
} from "../src/lib/conversations/agent-listing-share-search";
import {
  LISTING_SHARE_CARD,
  LISTING_SHARE_PAYLOAD_VERSION,
  type ListingShareSourceListing,
} from "../src/lib/conversations/listing-share";
import {
  AGENT_LISTING_SHARE_SEARCH_DEBOUNCE_MS,
  AGENT_LISTING_SHARE_SEARCH_ROUTE,
  agentListingShareSearchUrl,
  agentListingShareSendUrl,
  listingShareSendErrorMessage,
  newListingShareIdempotencyKey,
  resolveListingShareIdempotencyKey,
} from "../src/lib/chat/listing-share/client";
import type { WorkspaceListingEntitlement } from "../src/lib/tenancy/listing-entitlement";
import { buildListingSourceAuthorityKey } from "../src/lib/typesense/listing-document";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const TRREB = "cmtrdf23t000091u0cw3a5zu9";
const ORG_OTHER = "org_other_board";
const SAK_TRREB = buildListingSourceAuthorityKey(TRREB, "proptx")!;
const SAK_OTHER = buildListingSourceAuthorityKey(ORG_OTHER, "proptx")!;
const WS = "ws_houzzat";
const NOW = new Date("2026-10-10T12:00:00.000Z");

const entitled: WorkspaceListingEntitlement = {
  workspaceId: WS,
  authorities: [
    {
      organizationId: TRREB,
      providerKey: "proptx",
      sourceAuthorityKey: SAK_TRREB,
      capabilities: ["ACTIVE_LISTINGS", "MEDIA", "SOLD", "HISTORY"],
    },
  ],
};

function listing(
  overrides: Partial<ListingShareSourceListing> = {},
): ListingShareSourceListing & {
  media: Array<{ url: string; isPrimary: boolean; sortOrder: number }>;
} {
  return {
    id: "listing_1",
    mlsNumber: "X1234567",
    status: "ACTIVE",
    transactionType: "SALE",
    propertyType: "DETACHED",
    listPrice: 899_000,
    soldPrice: null,
    beds: 3,
    baths: 2,
    addressLine: "123 Main St",
    unitNumber: null,
    city: "Toronto",
    province: "ON",
    postalCode: "M5V 1A1",
    dataSource: "mls",
    organizationId: TRREB,
    providerKey: "proptx",
    media: [
      {
        url: "https://ampre.ca/listing/primary.jpg",
        isPrimary: true,
        sortOrder: 0,
      },
    ],
    ...overrides,
  };
}

function testQueryBounds() {
  assert.equal(parseAgentListingShareSearchQuery("").ok, false);
  assert.equal(parseAgentListingShareSearchQuery("a").ok, false);
  assert.equal(parseAgentListingShareSearchQuery("ab").ok, true);
  assert.equal(
    parseAgentListingShareSearchQuery("x".repeat(AGENT_LISTING_SHARE_SEARCH_MAX_Q + 1))
      .ok,
    false,
  );
  assert.equal(AGENT_LISTING_SHARE_SEARCH_MIN_Q, 2);
  assert.equal(AGENT_LISTING_SHARE_SEARCH_LIMIT, 12);
  assert.equal(AGENT_LISTING_SHARE_SEARCH_DEBOUNCE_MS, 300);
}

async function testAuthorizedSearchAndExclusions() {
  const rows = [
    listing(),
    listing({
      id: "listing_sold",
      mlsNumber: "SOLD9999",
      status: "SOLD",
    }),
    listing({
      id: "listing_other",
      mlsNumber: "OTHER111",
      organizationId: ORG_OTHER,
      providerKey: "proptx",
    }),
    listing({
      id: "listing_cond",
      mlsNumber: "COND2222",
      status: "SOLD_CONDITIONAL",
    }),
  ];

  const db: AgentListingShareSearchDb = {
    listing: {
      findMany: async () => rows,
    },
  };

  // Guest floor: PROPTX_FEED=idx for restricted check in related tests
  const prev = process.env.PROPTX_FEED;
  process.env.PROPTX_FEED = "idx";

  try {
    const ok = await searchAgentListingSharePicker(db, {
      q: "main",
      entitlement: entitled,
      trustedWorkspaceId: WS,
      now: NOW,
      searchInventory: async () => ({
        items: rows.map((r) => ({ mlsNumber: r.mlsNumber })),
      }),
    });
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    const mls = ok.items.map((i) => i.mlsNumber).sort();
    assert.deepEqual(mls, ["COND2222", "X1234567"]);
    for (const item of ok.items) {
      assert.equal(item.preview.card, LISTING_SHARE_CARD);
      assert.equal(item.preview.version, LISTING_SHARE_PAYLOAD_VERSION);
      assert.ok(!("soldPrice" in item.preview));
      assert.ok(item.preview.href.startsWith("/listing/"));
    }

    const crossTenant = await searchAgentListingSharePicker(db, {
      q: "main",
      entitlement: {
        workspaceId: "ws_other",
        authorities: [
          {
            organizationId: ORG_OTHER,
            providerKey: "proptx",
            sourceAuthorityKey: SAK_OTHER,
            capabilities: ["ACTIVE_LISTINGS", "MEDIA"],
          },
        ],
      },
      trustedWorkspaceId: WS,
      now: NOW,
      searchInventory: async () => ({
        items: [{ mlsNumber: "X1234567" }],
      }),
    });
    assert.equal(crossTenant.ok, false);
    if (!crossTenant.ok) assert.equal(crossTenant.reason, "FORBIDDEN");
  } finally {
    if (prev === undefined) delete process.env.PROPTX_FEED;
    else process.env.PROPTX_FEED = prev;
  }
}

function testIdempotencyHelpers() {
  const a = newListingShareIdempotencyKey();
  const b = newListingShareIdempotencyKey();
  assert.ok(a.length >= 8);
  assert.notEqual(a, b);

  const first = resolveListingShareIdempotencyKey({
    listingId: "listing_1",
    previous: null,
  });
  const retry = resolveListingShareIdempotencyKey({
    listingId: "listing_1",
    previous: first,
  });
  assert.equal(retry.key, first.key);
  const next = resolveListingShareIdempotencyKey({
    listingId: "listing_2",
    previous: first,
  });
  assert.notEqual(next.key, first.key);
  assert.equal(next.listingId, "listing_2");
}

function testErrorCopy() {
  assert.match(listingShareSendErrorMessage(401), /session/i);
  assert.match(listingShareSendErrorMessage(403), /conversation|share/i);
  assert.match(
    listingShareSendErrorMessage(403, "Listing not available"),
    /property/i,
  );
  assert.match(listingShareSendErrorMessage(409), /again/i);
  assert.doesNotMatch(listingShareSendErrorMessage(403), /entitlement/i);
  assert.doesNotMatch(listingShareSendErrorMessage(403), /VOW/i);
}

function testClientRoutes() {
  assert.equal(AGENT_LISTING_SHARE_SEARCH_ROUTE, "/api/agent/listings/share-search");
  assert.equal(
    agentListingShareSendUrl("lead_1"),
    "/api/agent/leads/lead_1/conversation/listing-share",
  );
  assert.ok(agentListingShareSearchUrl("main").includes("q=main"));
}

function testPaneWiring() {
  const pane = read("src/components/agent/chat/AgentChatTranscriptPane.tsx");
  assert.ok(pane.includes("ChatListingSharePicker"));
  assert.ok(pane.includes("onSendListingShare"));
  assert.ok(pane.includes("!smsSelected && leadId && onSendListingShare"));
  assert.ok(pane.includes("ChatQuickReplyPicker"));
  assert.ok(pane.includes("ChatEmojiPicker"));
  assert.ok(pane.includes("ChatVoiceRecorder"));
  // Picker must not call text send — inspect the JSX usage block
  const jsxStart = pane.lastIndexOf("<ChatListingSharePicker");
  assert.ok(jsxStart > 0);
  const shareBlock = pane.slice(jsxStart, jsxStart + 450);
  assert.ok(shareBlock.includes("onShared"));
  assert.ok(shareBlock.includes("clearTyping"));
  assert.ok(!shareBlock.includes("onSend("));
  assert.ok(!shareBlock.includes("submit("));

  const picker = read("src/components/chat/ChatListingSharePicker.tsx");
  assert.match(picker, /Share a property/);
  assert.match(picker, /ChatListingShareCard/);
  assert.match(picker, /fetchAgentListingShareSearch/);
  assert.match(picker, /postAgentListingShare/);
  assert.match(picker, /resolveListingShareIdempotencyKey/);
  assert.match(picker, /sendingRef/);
  assert.match(picker, /max-w-lg/);
  assert.match(picker, /min-h-10/);
  assert.match(picker, /role="dialog"/);
  assert.match(picker, /Escape/);
  assert.doesNotMatch(picker, /scheduleNotifyCustomer/);
  assert.doesNotMatch(picker, /workspaceId/);
  assert.doesNotMatch(picker, /soldPrice/);

  const route = read("src/app/api/agent/listings/share-search/route.ts");
  assert.match(route, /searchAgentListingSharePicker/);
  assert.match(route, /resolveListingEntitlementContextForRequest/);
  assert.match(route, /ACTIVE.*SOLD_CONDITIONAL|SOLD_CONDITIONAL/);
  assert.match(route, /requireAgentContextFromRequest/);
  assert.doesNotMatch(route, /workspaceId.*searchParams|searchParams.*workspaceId/);

  const thread = read("src/components/agent/chat/useAgentChatThread.ts");
  assert.match(thread, /appendListingShareMessage/);
  assert.match(thread, /appendV2ChatSentMessage/);

  const inbox = read("src/components/agent/chats/AgentChatsInbox.tsx");
  assert.match(inbox, /onSendListingShare=\{chat\.appendListingShareMessage\}/);

  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.match(host, /onSendListingShare: chat\.appendListingShareMessage/);
}

async function main() {
  testQueryBounds();
  await testAuthorizedSearchAndExclusions();
  testIdempotencyHelpers();
  testErrorCopy();
  testClientRoutes();
  testPaneWiring();
  console.log("agent-chat-listing-share-ui-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
