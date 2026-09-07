/**
 * Stage 3K.2 — hostname normalization selftest.
 * Run: pnpm tenant-domain-normalization:selftest
 */
import assert from "node:assert/strict";
import {
  hostnameHasWwwPrefix,
  normalizeWorkspaceHostname,
  wwwAliasForPrimaryHostname,
} from "../src/lib/tenancy/normalize-workspace-hostname";

function testDeterministic() {
  const a = normalizeWorkspaceHostname("Houzzat.COM");
  const b = normalizeWorkspaceHostname("houzzat.com");
  assert.equal(a.ok && b.ok && a.hostname === b.hostname, true);
  assert.equal(a.ok && a.hostname, "houzzat.com");
}

function testWwwPreserved() {
  const apex = normalizeWorkspaceHostname("alisyed.com");
  const www = normalizeWorkspaceHostname("www.alisyed.com");
  assert.ok(apex.ok && www.ok);
  assert.notEqual(apex.hostname, www.hostname);
  assert.ok(hostnameHasWwwPrefix(www.hostname!));
  assert.equal(
    wwwAliasForPrimaryHostname("alisyed.com"),
    "www.alisyed.com",
  );
}

function testPortStrip() {
  const r = normalizeWorkspaceHostname("houzzat.com:443");
  assert.ok(r.ok);
  assert.equal(r.hostname, "houzzat.com");
}

function testRejectProtocolAndPath() {
  assert.equal(normalizeWorkspaceHostname("https://houzzat.com").ok, false);
  assert.equal(normalizeWorkspaceHostname("houzzat.com/admin").ok, false);
  assert.equal(normalizeWorkspaceHostname("houzzat.com?x=1").ok, false);
}

function testRejectMalformed() {
  assert.equal(normalizeWorkspaceHostname("").ok, false);
  assert.equal(normalizeWorkspaceHostname("not a host!!!").ok, false);
}

function testTrailingDot() {
  const r = normalizeWorkspaceHostname("houzzat.com.");
  assert.ok(r.ok);
  assert.equal(r.hostname, "houzzat.com");
}

function testLocalDevHostsStillNormalize() {
  // Shared normalizer must keep parsing development Host headers.
  // CUSTOM claim rejection is claim-layer only (F.1 regression review).
  const localhost = normalizeWorkspaceHostname("localhost:3000");
  assert.ok(localhost.ok);
  assert.equal(localhost.hostname, "localhost");

  const loopback = normalizeWorkspaceHostname("127.0.0.1:3000");
  assert.ok(loopback.ok);
  assert.equal(loopback.hostname, "127.0.0.1");
}

function testIdnCanonical() {
  const r = normalizeWorkspaceHostname("bücher.example");
  assert.ok(r.ok);
  assert.equal(r.hostname, "xn--bcher-kva.example");
}

function testIpv6AndWildcardStillInvalidLabels() {
  assert.equal(normalizeWorkspaceHostname("[::1]").ok, false);
  assert.equal(normalizeWorkspaceHostname("::1").ok, false);
  assert.equal(normalizeWorkspaceHostname("*.example.com").ok, false);
}

async function main() {
  testDeterministic();
  testWwwPreserved();
  testPortStrip();
  testRejectProtocolAndPath();
  testRejectMalformed();
  testTrailingDot();
  testLocalDevHostsStillNormalize();
  testIdnCanonical();
  testIpv6AndWildcardStillInvalidLabels();
  console.log("tenant-domain-normalization:selftest ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
