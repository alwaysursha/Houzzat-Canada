/**
 * Chat V1 Milestone 4J — agent presence dashboard UI / publisher selftest (no DB).
 * Run: pnpm agent-presence-ui:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_PRESENCE_ROUTE,
  preferenceFromAvailability,
  PRESENCE_ACTIVITY_THROTTLE_MS,
  PRESENCE_CLIENT_HEARTBEAT_MS,
  PRESENCE_CLIENT_IDLE_MS,
  shouldSendPresenceHeartbeat,
} from "../src/lib/chat/presence/client";
import { PRESENCE_TTL_MS } from "../src/lib/chat/presence/constants";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testClientHelpers() {
  assert.equal(AGENT_PRESENCE_ROUTE, "/api/agent/presence");
  assert.ok(PRESENCE_CLIENT_HEARTBEAT_MS < PRESENCE_TTL_MS);
  assert.ok(PRESENCE_CLIENT_IDLE_MS >= 45_000);
  assert.ok(PRESENCE_ACTIVITY_THROTTLE_MS >= 500);
  assert.equal(preferenceFromAvailability("away"), "AWAY");
  assert.equal(preferenceFromAvailability("online"), "AVAILABLE");
  assert.equal(preferenceFromAvailability("offline"), "AVAILABLE");
  assert.equal(
    shouldSendPresenceHeartbeat({ now: 1000, lastSentAt: null }),
    true,
  );
  assert.equal(
    shouldSendPresenceHeartbeat({
      now: 1000,
      lastSentAt: 1000 - PRESENCE_CLIENT_HEARTBEAT_MS + 1,
    }),
    false,
  );
  assert.equal(
    shouldSendPresenceHeartbeat({
      now: 1000,
      lastSentAt: 1000 - PRESENCE_CLIENT_HEARTBEAT_MS,
    }),
    true,
  );
}

function testPublisherWiring() {
  const publisher = read(
    "src/components/agent/presence/useAgentPresencePublisher.ts",
  );
  assert.ok(publisher.includes("postAgentPresence"));
  assert.ok(publisher.includes('preference: next'));
  assert.ok(publisher.includes("pointerdown"));
  assert.ok(publisher.includes("keydown"));
  assert.ok(publisher.includes("touchstart"));
  assert.ok(publisher.includes("visibilitychange"));
  assert.ok(publisher.includes("pagehide"));
  assert.ok(publisher.includes("PRESENCE_CLIENT_IDLE_MS"));
  assert.ok(publisher.includes("Retry-After") || publisher.includes("retryAfterSec"));
  assert.ok(!publisher.includes("localStorage"));
  assert.ok(!publisher.includes("userId"));
  assert.ok(!publisher.includes("workspaceId"));
  assert.ok(!publisher.includes("lastActiveAt"));
  // Idle must not mutate preference via preference POST
  assert.ok(!publisher.includes('preference: "AWAY"'));
  assert.ok(!publisher.includes("mousemove"));
}

function testShellPlacement() {
  const shell = read("src/components/agent/AgentShell.tsx");
  assert.ok(shell.includes("AgentPresenceProvider"));
  assert.ok(shell.includes("AgentAvailabilityControl"));
  assert.equal(
    (shell.match(/AgentPresenceProvider/g) ?? []).length >= 4,
    true,
  );

  const instant = read("src/components/agent/AgentMobileInstantShell.tsx");
  assert.ok(instant.includes("AgentAvailabilityControl"));

  const control = read(
    "src/components/agent/presence/AgentAvailabilityControl.tsx",
  );
  assert.ok(control.includes("Available") || control.includes("Avail."));
  assert.ok(control.includes("Away"));
  assert.ok(control.includes("setPreference"));
  assert.ok(control.includes("preferencePending"));
  assert.ok(control.includes("preferenceError"));

  const provider = read(
    "src/components/agent/presence/AgentPresenceProvider.tsx",
  );
  assert.ok(provider.includes("useAgentPresencePublisher"));

  // Must not land on customer surfaces
  const customer = read("src/components/customer-chat/CustomerChatScreen.tsx");
  assert.ok(!customer.includes("AgentAvailabilityControl"));
  assert.ok(!customer.includes("AgentPresenceProvider"));
}

function testClientBodyPrivacy() {
  const client = read("src/lib/chat/presence/client.ts");
  assert.ok(client.includes("JSON.stringify(body)"));
  assert.ok(!client.includes("userId"));
  assert.ok(!client.includes("workspaceId"));
  assert.ok(client.includes("keepalive"));
}

function main() {
  testClientHelpers();
  testPublisherWiring();
  testShellPlacement();
  testClientBodyPrivacy();
  console.log("agent-presence-ui-selftest: ok");
}

main();
