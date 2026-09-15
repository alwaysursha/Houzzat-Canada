/**
 * TEMPORARY [push:delivery] observability selftest.
 * Run: pnpm push-delivery-log:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  logPushDeliveryEnqueue,
  logPushDeliveryResult,
  PUSH_DELIVERY_LOG_PREFIX,
  pushDeliveryUserIdPrefix,
} from "../src/lib/notifications/push-delivery-log";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function captureInfo(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = console.info;
  console.info = (...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(" "));
  };
  return {
    lines,
    restore: () => {
      console.info = original;
    },
  };
}

function payloadFromLine(line: string): Record<string, unknown> {
  const idx = line.indexOf("{");
  assert.ok(idx >= 0, `expected JSON payload in ${line}`);
  return JSON.parse(line.slice(idx)) as Record<string, unknown>;
}

const FORBIDDEN = [
  "token",
  "private_key",
  "privateKey",
  "client_email",
  "clientEmail",
  "title",
  "body",
  "email",
  "name",
  "phone",
  "href",
  "credential",
  "session",
];

function assertSanitized(payload: Record<string, unknown>, line: string) {
  const blob = JSON.stringify(payload).toLowerCase();
  for (const key of FORBIDDEN) {
    assert.equal(key in payload, false, `${key} must not be a log field`);
    if (key === "name" || key === "href") continue;
    assert.ok(!blob.includes(key), `${key} leaked in ${line}`);
  }
  assert.ok(!line.includes("BEGIN PRIVATE KEY"));
}

function main() {
  assert.equal(pushDeliveryUserIdPrefix("cmrz0wkxabcdefgh"), "cmrz0wkx");
  assert.equal(pushDeliveryUserIdPrefix("abc"), "abc");
  assert.equal(pushDeliveryUserIdPrefix("").length, 0);

  const enqueueCap = captureInfo();
  logPushDeliveryEnqueue({
    type: "lead_online",
    userIdPrefix: "cmrz0wkxEXTRA",
    shell: "houzzatpro",
  });
  enqueueCap.restore();
  assert.equal(enqueueCap.lines.length, 1);
  assert.ok(enqueueCap.lines[0]?.startsWith(PUSH_DELIVERY_LOG_PREFIX));
  const enqueue = payloadFromLine(enqueueCap.lines[0] ?? "");
  assert.equal(enqueue.stage, "enqueue");
  assert.equal(enqueue.type, "lead_online");
  assert.equal(enqueue.userIdPrefix, "cmrz0wkx");
  assert.equal(enqueue.shell, "houzzatpro");
  assert.equal("deviceCount" in enqueue, false);
  assert.equal("title" in enqueue, false);
  assert.equal("body" in enqueue, false);
  assertSanitized(enqueue, enqueueCap.lines[0] ?? "");

  const resultCap = captureInfo();
  logPushDeliveryResult({
    type: "lead_online",
    userIdPrefix: "cmrz0wkx",
    deviceCount: 6,
    shell: "houzzatpro",
    status: "sent",
    httpStatus: 200,
    errorCategory: null,
    successCount: 1,
    failureCount: 5,
    firebaseProjectId: "houzzat-aa1b0",
  });
  resultCap.restore();
  assert.equal(resultCap.lines.length, 1);
  const result = payloadFromLine(resultCap.lines[0] ?? "");
  assert.equal(result.stage, "result");
  assert.equal(result.type, "lead_online");
  assert.equal(result.userIdPrefix, "cmrz0wkx");
  assert.equal(result.deviceCount, 6);
  assert.equal(result.shell, "houzzatpro");
  assert.equal(result.status, "sent");
  assert.equal(result.httpStatus, 200);
  assert.equal(result.errorCategory, null);
  assert.equal(result.successCount, 1);
  assert.equal(result.failureCount, 5);
  assert.equal(result.firebaseProjectId, "houzzat-aa1b0");
  assertSanitized(result, resultCap.lines[0] ?? "");

  const failedCap = captureInfo();
  logPushDeliveryResult({
    type: "lead_online",
    userIdPrefix: "cmrz0wkx",
    deviceCount: 1,
    shell: "houzzatpro",
    status: "failed",
    httpStatus: 403,
    errorCategory: "fcm_permission_denied",
    successCount: 0,
    failureCount: 1,
    firebaseProjectId: null,
  });
  failedCap.restore();
  const failed = payloadFromLine(failedCap.lines[0] ?? "");
  assert.equal(failed.status, "failed");
  assert.equal(failed.httpStatus, 403);
  assert.equal(failed.errorCategory, "fcm_permission_denied");
  assert.equal(failed.firebaseProjectId, null);
  assertSanitized(failed, failedCap.lines[0] ?? "");

  const push = read("src/lib/notifications/push.ts");
  assert.ok(push.includes("logPushDeliveryEnqueue"));
  assert.ok(push.includes("logPushDeliveryResult"));
  const enqueueIdx = push.indexOf("logPushDeliveryEnqueue");
  const waitIdx = push.indexOf("scheduleWorkerSideEffect(deliverPushToUser(userId, payload))");
  assert.ok(enqueueIdx > 0 && waitIdx > enqueueIdx, "enqueue log must run before waitUntil");
  assert.ok(
    push.includes("configuredFirebaseProjectId"),
    "project id must be derived, not the raw secret",
  );
  assert.ok(
    !/logPushDelivery(?:Enqueue|Result)\([^)]*payload\.(title|body)/.test(push),
    "must not pass title/body into delivery logs",
  );
  assert.ok(
    !/logPushDelivery(?:Enqueue|Result)\([^)]*\.token/.test(push),
    "must not pass FCM tokens into delivery logs",
  );

  const logSrc = read("src/lib/notifications/push-delivery-log.ts");
  assert.ok(logSrc.includes("TEMPORARY"));
  assert.ok(!logSrc.includes("FIREBASE_SERVICE_ACCOUNT"));
  assert.ok(!logSrc.includes("BEGIN PRIVATE KEY"));

  console.log("push-delivery-log-selftest: OK");
}

main();
