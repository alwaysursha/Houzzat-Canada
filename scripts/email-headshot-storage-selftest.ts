/**
 * Phase 3D.2 — email headshot storage primitives selftest (hardened).
 * Run: pnpm email-headshot-storage:selftest
 *
 * Hermetic. No DB. No network. No real R2 writes/deletes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_EMAIL_HEADSHOT_FILENAME_SUFFIX,
  buildAgentEmailHeadshotObjectKey,
  buildAgentEmailHeadshotPublicUrl,
  buildTrustedBrandingAssetPublicUrl,
  deleteAgentEmailHeadshotSiblingIfUnreferenced,
  deriveAgentEmailHeadshotObjectKey,
  deriveAgentEmailHeadshotObjectKeyFromUrl,
  extractAgentEmailHeadshotObjectKeyFromUrl,
  isAgentEmailHeadshotObjectKey,
  parseAgentEmailHeadshotObjectKey,
  resolveTrustedBrandingAssetsPublicBase,
  setEmailHeadshotStorageTestDeps,
} from "@/lib/tenancy/branding-assets/email-headshot-storage";
import {
  buildAgentUserProfileObjectKey,
  parseAgentUserProfileObjectKey,
} from "@/lib/tenancy/branding-assets/keys";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS = "ws_storage_a";
const WS_B = "ws_storage_b";
const USER = "user_agent_a";
const USER_B = "user_agent_b";
const UNIQUE = "9eb6ecd755c37a0c3bb0ad65";
const TRUSTED_CDN = "https://branding-assets.example.com";

function section(name: string) {
  console.log(`  ✓ ${name}`);
}

function profileKey(ws = WS, user = USER, unique = UNIQUE, ext = "jpg") {
  return buildAgentUserProfileObjectKey({
    workspaceId: ws,
    userId: user,
    uniqueId: unique,
    ext,
  });
}

function profileUrl(ws = WS, user = USER, unique = UNIQUE) {
  return `${TRUSTED_CDN}/${profileKey(ws, user, unique)}`;
}

function emailKey(ws = WS, user = USER, unique = UNIQUE) {
  return `workspaces/${ws}/agents/${user}/profile/${unique}${AGENT_EMAIL_HEADSHOT_FILENAME_SUFFIX}`;
}

function withTrustedCdn(run: () => void) {
  setEmailHeadshotStorageTestDeps({
    trustedPublicBase: TRUSTED_CDN,
    isProduction: () => true,
  });
  try {
    run();
  } finally {
    setEmailHeadshotStorageTestDeps(null);
  }
}

// ---------------------------------------------------------------------------
// Valid derivation + correct trusted URL
// ---------------------------------------------------------------------------
withTrustedCdn(() => {
  const original = profileKey();
  const derived = deriveAgentEmailHeadshotObjectKey({
    profileObjectKey: original,
    workspaceId: WS,
    userId: USER,
  });
  assert.equal(derived, emailKey());
  assert.equal(isAgentEmailHeadshotObjectKey(derived), true);

  const again = deriveAgentEmailHeadshotObjectKey({
    profileObjectKey: original,
    workspaceId: WS,
    userId: USER,
  });
  assert.equal(again, derived, "deterministic derived key");

  const fromUrl = deriveAgentEmailHeadshotObjectKeyFromUrl({
    profileUrl: profileUrl(),
    workspaceId: WS,
    userId: USER,
  });
  assert.equal(fromUrl, emailKey());

  const publicUrl = buildAgentEmailHeadshotPublicUrl({
    emailHeadshotObjectKey: emailKey(),
    workspaceId: WS,
    userId: USER,
  });
  assert.equal(publicUrl, `${TRUSTED_CDN}/${emailKey()}`);
  section("Correct derived thumbnail key + trusted CDN URL");
});

// ---------------------------------------------------------------------------
// HTTP CDN base rejected in production mode
// ---------------------------------------------------------------------------
{
  setEmailHeadshotStorageTestDeps({
    trustedPublicBase: "http://branding-assets.example.com",
    isProduction: () => true,
  });
  try {
    assert.equal(resolveTrustedBrandingAssetsPublicBase(), null);
    assert.equal(buildTrustedBrandingAssetPublicUrl(emailKey()), null);
    assert.equal(
      buildAgentEmailHeadshotPublicUrl({
        emailHeadshotObjectKey: emailKey(),
        workspaceId: WS,
        userId: USER,
      }),
      null,
    );
    section("HTTP CDN base rejected in production mode");
  } finally {
    setEmailHeadshotStorageTestDeps(null);
  }
}

// ---------------------------------------------------------------------------
// Arbitrary hostname cannot be injected by callers (no publicBaseUrl param)
// ---------------------------------------------------------------------------
withTrustedCdn(() => {
  // Module API has no caller hostname argument — only configured trusted base.
  const src = read("src/lib/tenancy/branding-assets/email-headshot-storage.ts");
  assert.ok(
    !/buildAgentEmailHeadshotPublicUrl\([\s\S]*publicBaseUrl/.test(src),
    "public API must not accept caller publicBaseUrl",
  );
  assert.ok(src.includes("buildTrustedBrandingAssetPublicUrl"));
  assert.ok(!src.includes("deleteManagedAgentProfilePairIfUnreferenced"));

  // Even if env/test base is trusted, evil keys / wrong users are rejected.
  assert.equal(
    buildAgentEmailHeadshotPublicUrl({
      emailHeadshotObjectKey: emailKey(WS_B),
      workspaceId: WS,
      userId: USER,
    }),
    null,
  );
  section("Arbitrary hostname injection rejected (no caller base param)");
});

// ---------------------------------------------------------------------------
// Credentialed / query / fragment bases rejected
// ---------------------------------------------------------------------------
{
  const badBases = [
    "https://user:pass@branding-assets.example.com",
    "https://branding-assets.example.com?x=1",
    "https://branding-assets.example.com#frag",
    "https://branding-assets.example.com/path/../escape",
  ];
  for (const base of badBases) {
    setEmailHeadshotStorageTestDeps({
      trustedPublicBase: base,
      isProduction: () => true,
    });
    try {
      assert.equal(
        resolveTrustedBrandingAssetsPublicBase(),
        null,
        `expected reject base: ${base}`,
      );
    } finally {
      setEmailHeadshotStorageTestDeps(null);
    }
  }

  withTrustedCdn(() => {
    assert.equal(
      buildTrustedBrandingAssetPublicUrl(`${emailKey()}?x=1`),
      null,
    );
    assert.equal(
      buildTrustedBrandingAssetPublicUrl(`${emailKey()}#x`),
      null,
    );
  });
  section("Credentialed URL / query / fragment rejection");
}

// ---------------------------------------------------------------------------
// Encoded traversal + malformed keys
// ---------------------------------------------------------------------------
{
  assert.equal(
    deriveAgentEmailHeadshotObjectKey({
      profileObjectKey: `workspaces/${WS}/agents/${USER}/profile/%2e%2e/abc.jpg`,
      workspaceId: WS,
      userId: USER,
    }),
    null,
  );
  assert.equal(
    deriveAgentEmailHeadshotObjectKey({
      profileObjectKey: `workspaces/${WS}/agents/${USER}/profile/../${UNIQUE}.jpg`,
      workspaceId: WS,
      userId: USER,
    }),
    null,
  );
  assert.equal(
    deriveAgentEmailHeadshotObjectKey({
      profileObjectKey: `workspaces/${WS}//agents/${USER}/profile/${UNIQUE}.jpg`,
      workspaceId: WS,
      userId: USER,
    }),
    null,
  );
  assert.equal(
    deriveAgentEmailHeadshotObjectKeyFromUrl({
      profileUrl: `${TRUSTED_CDN}/workspaces/${WS}/agents/${USER}/profile/foo/../../other/profile/${UNIQUE}.jpg`,
      workspaceId: WS,
      userId: USER,
    }),
    null,
  );
  assert.equal(parseAgentUserProfileObjectKey("workspaces/../evil"), null);
  section("Encoded traversal attempts rejected");
}

// ---------------------------------------------------------------------------
// Cross-tenant / cross-agent rejection
// ---------------------------------------------------------------------------
{
  assert.equal(
    deriveAgentEmailHeadshotObjectKey({
      profileObjectKey: profileKey(),
      workspaceId: WS_B,
      userId: USER,
    }),
    null,
  );
  assert.equal(
    deriveAgentEmailHeadshotObjectKey({
      profileObjectKey: profileKey(),
      workspaceId: WS,
      userId: USER_B,
    }),
    null,
  );
  assert.equal(
    extractAgentEmailHeadshotObjectKeyFromUrl(
      `${TRUSTED_CDN}/${emailKey()}`,
      WS_B,
      USER,
    ),
    null,
  );
  assert.equal(
    extractAgentEmailHeadshotObjectKeyFromUrl(
      `${TRUSTED_CDN}/${emailKey()}`,
      WS,
      USER_B,
    ),
    null,
  );
  section("Cross-tenant / cross-agent key rejection");
}

// ---------------------------------------------------------------------------
// Unsupported / branding / already-derived
// ---------------------------------------------------------------------------
{
  assert.equal(
    deriveAgentEmailHeadshotObjectKey({
      profileObjectKey: `workspaces/${WS}/branding/agent-profile/${UNIQUE}.jpg`,
      workspaceId: WS,
      userId: USER,
    }),
    null,
  );
  assert.equal(
    deriveAgentEmailHeadshotObjectKey({
      profileObjectKey: `workspaces/${WS}/agents/${USER}/profile/${UNIQUE}.gif`,
      workspaceId: WS,
      userId: USER,
    }),
    null,
  );
  assert.equal(
    deriveAgentEmailHeadshotObjectKey({
      profileObjectKey: emailKey(),
      workspaceId: WS,
      userId: USER,
    }),
    null,
  );
  assert.equal(
    buildAgentEmailHeadshotObjectKey({
      workspaceId: WS,
      userId: USER,
      uniqueId: `${UNIQUE}-email-240`,
    }),
    null,
  );
  assert.equal(parseAgentEmailHeadshotObjectKey(emailKey())?.uniqueId, UNIQUE);
  section("Branding / unsupported ext / already-derived rejected");
}

// ---------------------------------------------------------------------------
// Non-production local fallback when base unset
// ---------------------------------------------------------------------------
{
  setEmailHeadshotStorageTestDeps({
    trustedPublicBase: null,
    isProduction: () => false,
  });
  try {
    assert.deepEqual(resolveTrustedBrandingAssetsPublicBase(), {
      kind: "local",
    });
    assert.equal(
      buildTrustedBrandingAssetPublicUrl(emailKey()),
      `/uploads/branding/${emailKey()}`,
    );
    section("Non-production local /uploads/branding fallback");
  } finally {
    setEmailHeadshotStorageTestDeps(null);
  }
}

// ---------------------------------------------------------------------------
// Production unset base fails closed
// ---------------------------------------------------------------------------
{
  setEmailHeadshotStorageTestDeps({
    trustedPublicBase: null,
    isProduction: () => true,
  });
  try {
    assert.equal(resolveTrustedBrandingAssetsPublicBase(), null);
    assert.equal(buildTrustedBrandingAssetPublicUrl(emailKey()), null);
    section("Production unset base fails closed");
  } finally {
    setEmailHeadshotStorageTestDeps(null);
  }
}

// ---------------------------------------------------------------------------
// No original-photo deletion capability in this module
// ---------------------------------------------------------------------------
{
  const storageSrc = read(
    "src/lib/tenancy/branding-assets/email-headshot-storage.ts",
  );
  assert.ok(
    !storageSrc.includes("deleteManagedAgentProfilePairIfUnreferenced"),
  );
  // Must not delete original profile objects — only sibling email keys.
  assert.ok(
    !/deleteObject\(originalKey\)/.test(storageSrc),
    "must not delete original profile keys",
  );
  assert.ok(storageSrc.includes("Never deletes the original"));
  assert.ok(storageSrc.includes("MAINTENANCE / FUTURE GC ONLY"));
  section("No original-photo deletion capability exposed");
}

// ---------------------------------------------------------------------------
// Upload paths do not call thumbnail cleanup
// ---------------------------------------------------------------------------
{
  const uploadSrc = read(
    "src/lib/tenancy/branding-assets/agent-user-profile-photo.ts",
  );
  const apiSrc = read("src/app/api/agent/profile/photo/route.ts");
  const uploaderSrc = read(
    "src/components/agent/AgentPortraitFocusUploader.tsx",
  );
  for (const [label, src] of [
    ["agent-user-profile-photo", uploadSrc],
    ["photo API", apiSrc],
    ["AgentPortraitFocusUploader", uploaderSrc],
  ] as const) {
    assert.ok(
      !src.includes("deleteAgentEmailHeadshotSiblingIfUnreferenced"),
      `${label} must not call thumbnail cleanup`,
    );
    assert.ok(
      !src.includes("email-headshot-storage"),
      `${label} must not import email-headshot-storage`,
    );
  }
  section("Thumbnail cleanup not called by upload paths");
}

async function main() {
  const deleted: string[] = [];
  let referenceResults: boolean[] = [];

  setEmailHeadshotStorageTestDeps({
    trustedPublicBase: TRUSTED_CDN,
    isProduction: () => true,
    isReferenced: async () => {
      const next = referenceResults.shift();
      return next ?? false;
    },
    deleteObject: async (objectKey) => {
      deleted.push(objectKey);
    },
  });

  try {
    // Referenced original retains thumb
    deleted.length = 0;
    referenceResults = [true];
    const retained = await deleteAgentEmailHeadshotSiblingIfUnreferenced({
      originalUrl: profileUrl(),
      workspaceId: WS,
      userId: USER,
    });
    assert.equal(retained, "retained_referenced");
    assert.equal(deleted.length, 0);

    // Unreferenced → delete only email sibling (never original)
    deleted.length = 0;
    referenceResults = [false, false];
    const cleared = await deleteAgentEmailHeadshotSiblingIfUnreferenced({
      originalUrl: profileUrl(),
      workspaceId: WS,
      userId: USER,
    });
    assert.equal(cleared, "deleted");
    assert.deepEqual(deleted, [emailKey()]);
    assert.ok(!deleted.includes(profileKey()));

    // Missing thumb: idempotent second delete attempt (still only email key)
    deleted.length = 0;
    referenceResults = [false, false];
    const again = await deleteAgentEmailHeadshotSiblingIfUnreferenced({
      originalUrl: profileUrl(),
      workspaceId: WS,
      userId: USER,
    });
    assert.equal(again, "deleted");
    assert.deepEqual(deleted, [emailKey()]);

    // Cross-tenant skip
    deleted.length = 0;
    referenceResults = [false, false];
    const foreign = await deleteAgentEmailHeadshotSiblingIfUnreferenced({
      originalUrl: profileUrl(),
      workspaceId: WS_B,
      userId: USER,
    });
    assert.equal(foreign, "skipped");
    assert.equal(deleted.length, 0);

    section("Missing thumbnail / sibling-only cleanup behavior");
  } finally {
    setEmailHeadshotStorageTestDeps(null);
  }

  console.log("\nemail-headshot-storage selftest: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
