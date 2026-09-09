import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonText } from "../src/lib/http/json-body";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testParseJsonText() {
  assert.equal(parseJsonText("").parse, "empty");
  assert.equal(parseJsonText("   \n").parse, "empty");
  assert.equal(parseJsonText("{").parse, "invalid");
  const ok = parseJsonText<{ ok: boolean }>('{"ok":true}');
  assert.equal(ok.parse, "ok");
  if (ok.parse === "ok") assert.equal(ok.data.ok, true);
}

function testNoRetryHelper() {
  const helper = read("src/lib/http/fetch-json.ts");
  assert.ok(
    !helper.includes("retries"),
    "fetch-json must not retry requests",
  );
  assert.ok(
    !helper.includes("for (let attempt"),
    "fetch-json must not loop retry attempts",
  );
  assert.ok(
    helper.includes("res.text()"),
    "client helper must read via res.text()",
  );
  assert.ok(
    !helper.includes("res.json()"),
    "client helper must not call Response.json()",
  );
}

function testRequestIdHeader() {
  const headers = read("src/lib/http/api-headers.ts");
  const helper = read("src/lib/http/json-api-response.ts");
  assert.ok(headers.includes("x-houzzat-request-id"));
  assert.ok(headers.includes("private, no-store"));
  assert.ok(helper.includes("HOUZZAT_REQUEST_ID_HEADER"));
  assert.ok(helper.includes("PRIVATE_NO_STORE"));
}

function testNoExceptionMessageLogging() {
  const logger = read("src/lib/http/json-api-response.ts");
  assert.ok(
    !logger.includes("error.message"),
    "logger must not read error.message",
  );
  assert.ok(
    !logger.includes("errorMessage"),
    "logger must not log errorMessage",
  );
  assert.ok(
    !logger.includes("sanitizeLogMessage"),
    "logger must not use message sanitization",
  );
  assert.ok(
    !logger.includes("error.stack"),
    "logger must not log stack",
  );
  assert.ok(logger.includes("errorName"));
  assert.ok(logger.includes("errorCode"));
  assert.ok(logger.includes("PRISMA_CODE"));

  const body = read("src/lib/http/json-body.ts");
  assert.ok(
    !body.includes("sanitizeLogMessage"),
    "json-body must not keep a message sanitizer",
  );

  const contact = read("src/app/api/account/contact/route.ts");
  assert.ok(contact.includes('event: "activity_log_failed"'));
  assert.ok(!contact.includes("console.error("));
  assert.ok(!contact.includes("error.message"));

  const summary = read("src/app/api/agent/leads/[id]/summary/route.ts");
  assert.ok(!summary.includes("error.message"));
  assert.ok(!summary.includes("console.error("));
}

function testContactPatchHardening() {
  const route = read("src/app/api/account/contact/route.ts");
  assert.ok(route.includes("jsonApiResponse"));
  assert.ok(route.includes("await request.json()"));
  assert.ok(route.includes("Invalid payload"));
  assert.ok(route.includes("activity_log_failed"));
  assert.ok(route.includes("isDatabaseUnavailableError"));
  assert.ok(route.includes("createRequestId"));
}

function testSummaryHardening() {
  const route = read("src/app/api/agent/leads/[id]/summary/route.ts");
  const ctxIdx = route.indexOf("requireAgentContextFromRequest(request");
  const tryIdx = route.lastIndexOf("try {", ctxIdx);
  assert.ok(ctxIdx >= 0, "summary must call requireAgentContextFromRequest");
  assert.ok(tryIdx >= 0 && ctxIdx > tryIdx, "auth must run inside try");
  assert.ok(route.includes("sideEffects: false"));
  assert.ok(route.includes("jsonBytes"));
  assert.ok(route.includes("jsonApiResponse"));
}

function testClientsNoResJsonOnContactPatch() {
  const contact = read("src/components/account/ContactUpdateReminder.tsx");
  const persist = contact.slice(contact.indexOf("persistContact"));
  assert.ok(persist.includes("readJsonResponse"));
  assert.ok(!persist.includes("res.json()"));
  assert.ok(!persist.includes("retries"));

  const verify = read("src/components/auth/EmailVerificationRequired.tsx");
  const save = verify.slice(
    verify.indexOf("async function saveEmailIfChanged"),
    verify.indexOf("async function requestEmail"),
  );
  assert.ok(save.includes("readJsonResponse"));
  assert.ok(!save.includes("res.json()"));
  assert.ok(save.includes("Could not update email."));
  assert.ok(!save.includes("retries"));
}

function testClientsNoResJsonOnSummary() {
  const profile = read("src/components/agent/CustomerProfile.tsx");
  const helper = profile.slice(
    profile.indexOf("async function fetchLeadSummary"),
    profile.indexOf("export function CustomerProfile"),
  );
  assert.ok(helper.includes("readJsonResponse"));
  assert.ok(!helper.includes("res.json()"));
  assert.ok(!profile.includes("fetchJson("));
}

testParseJsonText();
testRequestIdHeader();
testNoRetryHelper();
testNoExceptionMessageLogging();
testContactPatchHardening();
testSummaryHardening();
testClientsNoResJsonOnContactPatch();
testClientsNoResJsonOnSummary();
console.log("json-api-hardening-selftest: ok");
