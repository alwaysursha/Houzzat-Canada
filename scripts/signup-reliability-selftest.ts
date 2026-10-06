import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SIGNUP_CONSENT_SPECS } from "../src/lib/auth/sign-up-consent";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const signUpRoute = readFileSync(
  join(root, "src/app/api/auth/sign-up/route.ts"),
  "utf8",
);
const signUpConsent = readFileSync(
  join(root, "src/lib/auth/sign-up-consent.ts"),
  "utf8",
);

function testNoCreateManyOnSignupRoute() {
  assert.ok(
    !signUpRoute.includes("consentEvent.createMany"),
    "sign-up route must not use consentEvent.createMany",
  );
  assert.ok(
    !signUpConsent.includes("consentEvent.createMany"),
    "sign-up consent helper must not use consentEvent.createMany",
  );
}

function testNoNestedConsentCreate() {
  assert.ok(
    !signUpRoute.includes("consentEvents:"),
    "sign-up route must not nest consentEvents.create in user.create",
  );
  assert.ok(
    !signUpRoute.includes("consentEvents.create"),
    "sign-up route must not use nested consentEvents.create",
  );
}

function testSequentialConsentCreates() {
  const createCount = (signUpConsent.match(/consentEvent\.create\(/g) ?? [])
    .length;
  assert.equal(
    createCount,
    1,
    "persistSignupConsentEvents should call consentEvent.create once in a loop",
  );
  assert.ok(
    signUpConsent.includes("for (const spec of SIGNUP_CONSENT_SPECS)"),
    "consent writes must iterate SIGNUP_CONSENT_SPECS sequentially",
  );
}

function testExpectedConsentTypes() {
  assert.deepEqual(
    SIGNUP_CONSENT_SPECS.map((row) => row.kind),
    ["terms_accept", "vow_accept", "email_phone_comms"],
  );
  assert.equal(SIGNUP_CONSENT_SPECS.length, 3);
}

function testConsentBeforeSuccessResponse() {
  const consentIdx = signUpRoute.indexOf("persistSignupConsentEvents");
  const sideEffectIdx = signUpRoute.indexOf("scheduleWorkerSideEffect(");
  const completeIdx = signUpRoute.indexOf('stage = "signup_complete"');
  const responseIdx = signUpRoute.indexOf("needsQualification: true");

  assert.ok(consentIdx > 0, "persistSignupConsentEvents must be present");
  assert.ok(
    sideEffectIdx > consentIdx,
    "lead/email side effects must run after consent persistence is awaited",
  );
  assert.ok(
    completeIdx > consentIdx,
    "signup_complete stage must be logged after consent",
  );
  assert.ok(
    responseIdx > consentIdx,
    "200 response must come after consent persistence",
  );
  const leadCaptureIdx = signUpRoute.indexOf("await captureWebsiteLead");
  assert.ok(
    leadCaptureIdx > consentIdx && leadCaptureIdx < responseIdx,
    "User+Lead capture must complete before the success response (OTP boundary)",
  );
}

function testConsentNotInBackground() {
  const sideEffectBlock = signUpRoute.slice(
    signUpRoute.indexOf("scheduleWorkerSideEffect("),
  );
  assert.ok(
    !sideEffectBlock.includes("persistSignupConsentEvents"),
    "consent must not be moved into scheduleWorkerSideEffect",
  );
  assert.ok(
    !sideEffectBlock.includes("consentEvent.create"),
    "consent writes must not run in background side effects",
  );
}

function testSideEffectsUnchanged() {
  assert.ok(
    signUpRoute.includes("captureWebsiteLead"),
    "signup must still capture website lead after DB success",
  );
  assert.ok(
    !signUpRoute.includes("sendEmailVerification"),
    "signup must not send automatic verification email immediately",
  );
  assert.ok(
    signUpRoute.includes("emailVerifyNudgeDueAt"),
    "signup must schedule durable 24h verification email due time",
  );
  assert.ok(
    signUpRoute.includes("sendWelcomeEmail"),
    "signup must still send welcome email in side effect",
  );
}

function testStageDiagnostics() {
  for (const stage of [
    "user_lookup",
    "password_hash",
    "user_create",
    "consent_create",
    "signup_complete",
  ]) {
    assert.ok(signUpRoute.includes(stage), `missing stage log: ${stage}`);
  }
  assert.ok(
    signUpRoute.includes("logSignUpFailure"),
    "signup must log sanitized failure stages",
  );
}

function testNoAuthChanges() {
  const forbidden = [
    "signIn(",
    "auth(",
    "getServerSession",
    "NextAuth",
    "biometric",
    "middleware",
  ];
  for (const token of forbidden) {
    assert.ok(
      !signUpRoute.includes(token),
      `sign-up route must not touch auth path: ${token}`,
    );
  }
}

testNoCreateManyOnSignupRoute();
testNoNestedConsentCreate();
testSequentialConsentCreates();
testExpectedConsentTypes();
testConsentBeforeSuccessResponse();
testConsentNotInBackground();
testSideEffectsUnchanged();
testStageDiagnostics();
testNoAuthChanges();

console.log("signup-reliability-selftest: ok");
