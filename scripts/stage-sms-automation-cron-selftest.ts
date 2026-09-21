/**
 * Production SMS automation scheduler wiring.
 * Run: pnpm sms-automation-cron:selftest
 *
 * No production writes. No Twilio send. No cron invocation. No deploy.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SMS_AUTOMATION_CRON } from "../src/lib/sms/automations";
import {
  beginSmsAutomationCronRun,
  endSmsAutomationCronRun,
  isSmsAutomationCronRunInFlight,
  summarizeSmsAutomationCronError,
} from "../src/lib/sms/automations/cron-lock";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testScheduleConstant() {
  assert.equal(SMS_AUTOMATION_CRON.job, "sms-automations-inactive");
  assert.equal(SMS_AUTOMATION_CRON.hourLocal, 7);
  assert.equal(SMS_AUTOMATION_CRON.minuteLocal, 0);
  assert.equal(SMS_AUTOMATION_CRON.timeZone, "America/Toronto");
  assert.ok(SMS_AUTOMATION_CRON.schedule.includes("07:00"));
  assert.ok(SMS_AUTOMATION_CRON.schedule.includes("LaunchAgent"));
}

function testLaunchAgentMatchesDigestsPattern() {
  const plist = read("scripts/macos/com.houzzat.sms-automations.plist");
  assert.ok(plist.includes("com.houzzat.sms-automations"));
  assert.ok(plist.includes("<key>Hour</key>"));
  assert.ok(plist.includes("<integer>7</integer>"));
  assert.ok(plist.includes("<key>Minute</key>"));
  assert.ok(plist.includes("<integer>0</integer>"));
  assert.ok(plist.includes("<key>RunAtLoad</key>"));
  assert.ok(plist.includes("<false/>"));
  assert.ok(plist.includes("run-sms-automations-mac.sh"));
  assert.equal(plist.includes("StartInterval"), false);

  const install = read(
    "scripts/macos/install-sms-automations-launchagent.sh",
  );
  assert.ok(install.includes("com.houzzat.sms-automations"));
  assert.ok(install.includes("pnpm sms-automations:run"));
  assert.ok(install.includes("houzzat-sms-automations.lock"));
  assert.ok(install.includes("SKIP: another sms-automations run is already running"));
  assert.equal(install.includes("launchctl kickstart"), false);

  const runner = read("scripts/run-sms-automations-mac.sh");
  assert.ok(runner.includes("pnpm sms-automations:run"));
  assert.ok(runner.includes("houzzat-sms-automations.lock"));
  assert.ok(runner.includes("SKIP: another sms-automations run is already running"));
}

function testHttpRouteAndOptionalGithubDispatch() {
  const cron = read("src/app/api/cron/sms-automations/route.ts");
  assert.ok(cron.includes("runInactiveLeadSmsAutomations"));
  assert.ok(cron.includes("beginSmsAutomationCronRun"));
  assert.ok(cron.includes("OVERLAP"));
  assert.ok(cron.includes("SMS_AUTOMATION_CRON.schedule"));
  assert.ok(cron.includes("summarizeSmsAutomationCronError"));
  assert.equal(cron.includes("phoneE164"), false);
  assert.equal(cron.includes("error.message"), false);
  assert.equal(cron.includes(".body"), false);

  const workflow = read(".github/workflows/sms-automations.yml");
  assert.ok(workflow.includes("workflow_dispatch"));
  assert.ok(workflow.includes("/api/cron/sms-automations"));
  assert.ok(workflow.includes("sms-automations-schedule"));
  assert.ok(workflow.includes("Primary scheduler is the Sync Mac LaunchAgent"));
  assert.equal(workflow.includes("cron:"), false);

  const wrangler = read("wrangler.jsonc");
  assert.equal(wrangler.includes('"crons"'), false);
}

function testDuplicateProtectionAndSafeLogs() {
  const execute = read("src/lib/sms/automations/execute.ts");
  assert.ok(execute.includes("workspaceId_leadId_automationKey_cycleKey"));
  assert.ok(execute.includes('existing.status === "SENT"'));
  assert.equal(execute.includes("error.message"), false);

  const inactive = read("src/lib/sms/automations/inactive.ts");
  assert.ok(inactive.includes("inactiveCycleKey"));
  assert.ok(inactive.includes("leadInactive14"));
  assert.equal(inactive.includes("error.message"), false);
  assert.equal(inactive.includes("phoneE164"), false);

  const localRun = read("scripts/run-sms-automations.ts");
  assert.ok(localRun.includes("scanned"));
  assert.ok(localRun.includes("sent"));
  assert.ok(localRun.includes("skipped"));
  assert.equal(localRun.includes("phone"), false);
}

function testOverlapLock() {
  endSmsAutomationCronRun();
  assert.equal(isSmsAutomationCronRunInFlight(), false);
  assert.equal(beginSmsAutomationCronRun(), true);
  assert.equal(isSmsAutomationCronRunInFlight(), true);
  assert.equal(beginSmsAutomationCronRun(), false);
  endSmsAutomationCronRun();
  assert.equal(beginSmsAutomationCronRun(), true);
  endSmsAutomationCronRun();
  assert.equal(summarizeSmsAutomationCronError(new TypeError("secret +16475550101")), "TypeError");
  assert.equal(summarizeSmsAutomationCronError("nope"), "ERROR");
}

function main() {
  testScheduleConstant();
  testLaunchAgentMatchesDigestsPattern();
  testHttpRouteAndOptionalGithubDispatch();
  testDuplicateProtectionAndSafeLogs();
  testOverlapLock();
  console.log("sms-automation-cron selftest ok");
}

main();
