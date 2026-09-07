/**
 * Stage 6.11E.5 — Team member photo upload selftest.
 * Run: pnpm stage-6.11e5-team-member-photo:selftest
 * No production mutation / deploy / Typesense / MLS.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OwnerActivationError } from "@/lib/platform/activation";
import {
  setBrandingStorageTestDeps,
} from "@/lib/tenancy/branding-assets/storage";
import {
  getTemplate,
  listSelectableTemplates,
  TEAM_SIGNATURE_TEMPLATE_ID,
} from "@/lib/tenancy/templates";
import { createFixtureHostResolutionDeps } from "@/lib/tenancy/resolve-workspace-host";
import {
  buildTeamMemberPhotoObjectKey,
  extractManagedTeamMemberPhotoObjectKey,
  extractTeamMemberPhotoObjectKeyFromUrl,
  isAcceptedTeamMemberPhotoUrl,
  normalizeTeamMemberWriteFields,
  removeOwnerTeamMemberPhoto,
  TEAM_MEMBER_PHOTO_MAX_BYTES,
  uploadOwnerTeamMemberPhoto,
  validateTeamMemberPhotoBytes,
} from "@/lib/tenancy/team-roster";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

/** Minimal valid 1×1 PNG. */
function tinyPng(): Uint8Array {
  return Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
}

/** Minimal JPEG SOF declaring 400×500 (agent-profile floor). */
function portraitJpeg(): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
    0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x01,
    0xf4, 0x01, 0x90, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9,
  ]);
}

/** Minimal VP8X WebP declaring 400×500. */
function portraitWebp(): Uint8Array {
  // RIFF....WEBP + VP8X chunk with canvas 399/499 (+1) = 400×500
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  bytes[4] = 22;
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  bytes.set([0x56, 0x50, 0x38, 0x58], 12); // VP8X
  bytes[16] = 10; // chunk size
  // flags + reserved
  // canvas width-1 at 24..26 little-endian 24-bit = 399
  bytes[24] = 0x8f;
  bytes[25] = 0x01;
  bytes[26] = 0x00;
  // canvas height-1 = 499
  bytes[27] = 0xf3;
  bytes[28] = 0x01;
  bytes[29] = 0x00;
  return bytes;
}

type MemberRow = {
  id: string;
  workspaceId: string;
  name: string | null;
  designation: string | null;
  cellPhone: string | null;
  email: string | null;
  bio: string | null;
  photoUrl: string | null;
  sortOrder: number;
  isVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function makeFakePrisma(opts: {
  workspaceId: string;
  workspaceStatus?: "ACTIVE" | "SUSPENDED";
  memberRole?: "OWNER" | "AGENT";
  memberStatus?: "ACTIVE" | "SUSPENDED" | "INVITED";
  members: Map<string, MemberRow>;
}) {
  const workspaceStatus = opts.workspaceStatus ?? "ACTIVE";
  const memberRole = opts.memberRole ?? "OWNER";
  const memberStatus = opts.memberStatus ?? "ACTIVE";
  const profile = {
    workspaceId: opts.workspaceId,
    aboutText: null,
    serviceAreas: null,
    leaderMemberId: null,
    updatedAt: new Date(),
  };

  return {
    workspace: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id !== opts.workspaceId) return null;
        return {
          id: opts.workspaceId,
          slug: "tenant-a",
          status: workspaceStatus,
        };
      },
    },
    workspaceMember: {
      findUnique: async ({
        where,
      }: {
        where: { workspaceId_userId: { workspaceId: string; userId: string } };
      }) => {
        if (where.workspaceId_userId.workspaceId !== opts.workspaceId) {
          return null;
        }
        return { role: memberRole, status: memberStatus };
      },
    },
    workspaceTeamMember: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; workspaceId: string };
      }) => {
        const row = opts.members.get(where.id);
        if (!row || row.workspaceId !== where.workspaceId) return null;
        return { ...row };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { photoUrl: string | null };
      }) => {
        const row = opts.members.get(where.id);
        if (!row) throw new Error("missing member");
        row.photoUrl = data.photoUrl;
        row.updatedAt = new Date();
        return { ...row };
      },
    },
    workspaceTeamProfile: {
      findUniqueOrThrow: async ({
        where,
      }: {
        where: { workspaceId: string };
      }) => {
        if (where.workspaceId !== opts.workspaceId) throw new Error("profile");
        return { ...profile };
      },
      findUnique: async ({
        where,
      }: {
        where: { workspaceId: string };
      }) => {
        if (where.workspaceId !== opts.workspaceId) return null;
        return { ...profile };
      },
      create: async () => ({ ...profile }),
    },
  };
}

function hostDeps(workspaceId: string) {
  return createFixtureHostResolutionDeps([
    {
      hostname: "tenant-a.houzzatpro.com",
      workspaceId,
      workspaceSlug: "tenant-a",
      kind: "PLATFORM",
      role: "PRIMARY",
      domainStatus: "ACTIVE",
      workspaceStatus: "ACTIVE",
    },
  ]);
}

function ownerRequest(): Request {
  return new Request("https://tenant-a.houzzatpro.com/api/onboarding/team-members/m1/photo", {
    method: "POST",
    headers: { host: "tenant-a.houzzatpro.com" },
  });
}

async function main() {
  console.log("\n=== STAGE 6.11E.5 — TEAM MEMBER PHOTO UPLOAD ===\n");

  const manageSrc = read("src/lib/tenancy/team-roster/manage.ts");
  const photoSrc = read("src/lib/tenancy/team-roster/photo.ts");
  const routeSrc = read(
    "src/app/api/onboarding/team-members/[memberId]/photo/route.ts",
  );
  const resolveSrc = read(
    "src/lib/tenancy/templates/resolve-team-signature-view.ts",
  );

  {
    const team = getTemplate(TEAM_SIGNATURE_TEMPLATE_ID);
    assert.equal(team?.selectable, false);
    assert.equal(listSelectableTemplates().length, 2);
    assert.ok(resolveSrc.includes("brand.teamRoster") || resolveSrc.includes("teamRoster"));
    console.log("[0] selectable=false + public roster resolve uses teamRoster... PASS");
  }

  {
    const key = buildTeamMemberPhotoObjectKey({
      workspaceId: "ws_a",
      memberId: "mem_1",
      uniqueId: "abc123def456",
      ext: "jpg",
    });
    assert.equal(
      key,
      "workspaces/ws_a/team-members/mem_1/abc123def456.jpg",
    );
    assert.ok(!key.includes(".."));
    assert.throws(() =>
      buildTeamMemberPhotoObjectKey({
        workspaceId: "ws/../x",
        memberId: "m",
        uniqueId: "u",
        ext: "jpg",
      }),
    );

    const url = `https://cdn.example.com/${key}`;
    assert.equal(isAcceptedTeamMemberPhotoUrl(url, "ws_a", "mem_1"), true);
    assert.equal(isAcceptedTeamMemberPhotoUrl(url, "ws_b", "mem_1"), false);
    assert.equal(isAcceptedTeamMemberPhotoUrl(url, "ws_a", "mem_other"), false);
    assert.equal(extractTeamMemberPhotoObjectKeyFromUrl(url, "ws_a"), key);
    assert.equal(
      extractManagedTeamMemberPhotoObjectKey({
        url,
        workspaceId: "ws_a",
        memberId: "mem_1",
      }),
      key,
    );
    assert.equal(
      extractManagedTeamMemberPhotoObjectKey({
        url: "https://evil.example/photo.jpg",
        workspaceId: "ws_a",
        memberId: "mem_1",
      }),
      null,
    );
    assert.equal(
      extractManagedTeamMemberPhotoObjectKey({
        url: "/uploads/branding/workspaces/ws_a/branding/logo/x.png",
        workspaceId: "ws_a",
        memberId: "mem_1",
      }),
      null,
    );
    console.log("[1] storage key + managed URL acceptance... PASS");
  }

  {
    assert.equal(TEAM_MEMBER_PHOTO_MAX_BYTES, 5 * 1024 * 1024);

    const jpg = validateTeamMemberPhotoBytes(portraitJpeg());
    assert.ok(!("code" in jpg));
    if (!("code" in jpg)) assert.equal(jpg.mime, "image/jpeg");

    // PNG portrait floor via agent-profile rules: 1×1 rejected
    const tiny = validateTeamMemberPhotoBytes(tinyPng());
    assert.ok("code" in tiny);
    if ("code" in tiny) assert.equal(tiny.code, "DIMENSIONS_TOO_SMALL");

    const webp = validateTeamMemberPhotoBytes(portraitWebp());
    assert.ok(!("code" in webp));
    if (!("code" in webp)) assert.equal(webp.mime, "image/webp");

    const empty = validateTeamMemberPhotoBytes(new Uint8Array(0));
    assert.ok("code" in empty);
    if ("code" in empty) assert.equal(empty.code, "EMPTY_FILE");

    const bad = validateTeamMemberPhotoBytes(
      new TextEncoder().encode("not-an-image"),
    );
    assert.ok("code" in bad);
    if ("code" in bad) assert.equal(bad.code, "UNSUPPORTED_MIME");

    const oversized = validateTeamMemberPhotoBytes(
      new Uint8Array(TEAM_MEMBER_PHOTO_MAX_BYTES + 1),
    );
    assert.ok("code" in oversized);
    if ("code" in oversized) assert.equal(oversized.code, "FILE_TOO_LARGE");

    // PNG accepted when dimensions meet floor — reuse JPEG for positive PNG path
    // via branding validate already covered; magic PNG 1×1 proves MIME detection.
    const pngMime = validateTeamMemberPhotoBytes(tinyPng());
    assert.ok("code" in pngMime); // too small, but MIME was PNG before dim check
    console.log("[2] image validation (jpeg/webp/empty/mime/size)... PASS");
  }

  {
    assert.throws(
      () =>
        normalizeTeamMemberWriteFields(
          { name: "Ali", photoUrl: "https://evil/x.jpg" },
          "update",
        ),
      (e: unknown) =>
        e instanceof OwnerActivationError &&
        e.code === "PHOTO_URL_NOT_WRITABLE",
    );
    console.log("[3] generic E.4 photoUrl still rejected... PASS");
  }

  // Auth + upload/replace/delete with fake prisma + storage
  {
    const prevScope = process.env.TENANT_DOMAIN_SCOPE;
    process.env.TENANT_DOMAIN_SCOPE = "workspace";

    const WS = "ws_tenant_a";
    const MEM = "mem_alice";
    const members = new Map<string, MemberRow>([
      [
        MEM,
        {
          id: MEM,
          workspaceId: WS,
          name: "Alice",
          designation: "Broker",
          cellPhone: null,
          email: null,
          bio: null,
          photoUrl: null,
          sortOrder: 0,
          isVisible: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    ]);
    const deletedKeys: string[] = [];
    const stored = new Map<string, Uint8Array>();

    setBrandingStorageTestDeps({
      isProduction: () => false,
      getPublicBase: () => "https://branding.test",
      getBucket: async () => ({
        put: async (key, value) => {
          const bytes =
            value instanceof Uint8Array
              ? value
              : new Uint8Array(value as ArrayBuffer);
          stored.set(key, bytes);
        },
        delete: async (key) => {
          const k = Array.isArray(key) ? key[0]! : key;
          deletedKeys.push(k);
          stored.delete(k);
        },
      }),
    });

    try {
      const file = new File([portraitJpeg()], "alice.jpg", {
        type: "image/jpeg",
      });

      // Unauthenticated: session required (structural).
      assert.ok(
        read("src/lib/platform/activation/onboarding.ts").includes(
          '"UNAUTHENTICATED"',
        ),
      );

      // Non-OWNER
      await assert.rejects(
        () =>
          uploadOwnerTeamMemberPhoto({
            request: ownerRequest(),
            memberId: MEM,
            file,
            userId: "user_agent",
            prisma: makeFakePrisma({
              workspaceId: WS,
              members,
              memberRole: "AGENT",
            }) as never,
            hostDeps: hostDeps(WS),
          }),
        (e: unknown) =>
          e instanceof OwnerActivationError && e.code === "FORBIDDEN",
      );

      // Inactive membership
      await assert.rejects(
        () =>
          uploadOwnerTeamMemberPhoto({
            request: ownerRequest(),
            memberId: MEM,
            file,
            userId: "user_owner",
            prisma: makeFakePrisma({
              workspaceId: WS,
              members,
              memberStatus: "SUSPENDED",
            }) as never,
            hostDeps: hostDeps(WS),
          }),
        (e: unknown) =>
          e instanceof OwnerActivationError && e.code === "FORBIDDEN",
      );

      // Cross-workspace member id
      await assert.rejects(
        () =>
          uploadOwnerTeamMemberPhoto({
            request: ownerRequest(),
            memberId: "mem_other_ws",
            file,
            userId: "user_owner",
            prisma: makeFakePrisma({ workspaceId: WS, members }) as never,
            hostDeps: hostDeps(WS),
          }),
        (e: unknown) =>
          e instanceof OwnerActivationError && e.code === "NOT_FOUND",
      );

      // OWNER success
      const uploaded = await uploadOwnerTeamMemberPhoto({
        request: ownerRequest(),
        memberId: MEM,
        file,
        userId: "user_owner",
        prisma: makeFakePrisma({ workspaceId: WS, members }) as never,
        hostDeps: hostDeps(WS),
      });
      assert.ok(
        uploaded.photoUrl?.startsWith("https://branding.test/workspaces/"),
      );
      assert.ok(uploaded.photoUrl?.includes(`/team-members/${MEM}/`));
      assert.ok(uploaded.photoUrl?.endsWith(".jpg"));
      assert.equal(stored.size, 1);
      const firstKey = [...stored.keys()][0]!;
      assert.ok(firstKey.startsWith(`workspaces/${WS}/team-members/${MEM}/`));

      // Replacement: upload again; old managed key best-effort deleted
      members.get(MEM)!.photoUrl = uploaded.photoUrl;
      deletedKeys.length = 0;
      const replaced = await uploadOwnerTeamMemberPhoto({
        request: ownerRequest(),
        memberId: MEM,
        file,
        userId: "user_owner",
        prisma: makeFakePrisma({ workspaceId: WS, members }) as never,
        hostDeps: hostDeps(WS),
      });
      assert.notEqual(replaced.photoUrl, uploaded.photoUrl);
      assert.ok(deletedKeys.includes(firstKey));
      assert.equal(stored.has(firstKey), false);

      // External old URL never deleted
      members.get(MEM)!.photoUrl = "https://cdn.evil/external.jpg";
      deletedKeys.length = 0;
      stored.clear();
      const afterExternal = await uploadOwnerTeamMemberPhoto({
        request: ownerRequest(),
        memberId: MEM,
        file,
        userId: "user_owner",
        prisma: makeFakePrisma({ workspaceId: WS, members }) as never,
        hostDeps: hostDeps(WS),
      });
      assert.equal(deletedKeys.length, 0);
      assert.ok(afterExternal.photoUrl?.includes(`/team-members/${MEM}/`));

      // Delete clears DB + managed object
      const managedKey = extractManagedTeamMemberPhotoObjectKey({
        url: afterExternal.photoUrl,
        workspaceId: WS,
        memberId: MEM,
      })!;
      members.get(MEM)!.photoUrl = afterExternal.photoUrl;
      deletedKeys.length = 0;
      const cleared = await removeOwnerTeamMemberPhoto({
        request: ownerRequest(),
        memberId: MEM,
        userId: "user_owner",
        prisma: makeFakePrisma({ workspaceId: WS, members }) as never,
        hostDeps: hostDeps(WS),
      });
      assert.equal(cleared.photoUrl, null);
      assert.ok(deletedKeys.includes(managedKey));

      // Delete with external URL: clear DB, do not delete object
      members.get(MEM)!.photoUrl = "https://cdn.evil/keep.jpg";
      deletedKeys.length = 0;
      const clearedExternal = await removeOwnerTeamMemberPhoto({
        request: ownerRequest(),
        memberId: MEM,
        userId: "user_owner",
        prisma: makeFakePrisma({ workspaceId: WS, members }) as never,
        hostDeps: hostDeps(WS),
      });
      assert.equal(clearedExternal.photoUrl, null);
      assert.equal(deletedKeys.length, 0);

      console.log("[4] auth + upload/replace/delete flows... PASS");
    } finally {
      setBrandingStorageTestDeps(null);
      if (prevScope === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
      else process.env.TENANT_DOMAIN_SCOPE = prevScope;
    }
  }

  {
    assert.ok(routeSrc.includes("uploadOwnerTeamMemberPhoto"));
    assert.ok(routeSrc.includes("removeOwnerTeamMemberPhoto"));
    assert.ok(routeSrc.includes("requireHostBoundOwnerOnboardingContext") === false);
    // authority via manage helpers
    assert.ok(manageSrc.includes("requireHostBoundOwnerOnboardingContext"));
    assert.ok(manageSrc.includes("uploadOwnerTeamMemberPhoto"));
    assert.ok(manageSrc.includes("removeOwnerTeamMemberPhoto"));
    assert.ok(!/\$transaction\s*\(/.test(manageSrc));
    assert.ok(!/\.updateMany\s*\(/.test(manageSrc));
    assert.ok(!/\$transaction\s*\(/.test(routeSrc));
    assert.ok(!/\.updateMany\s*\(/.test(routeSrc));
    assert.ok(photoSrc.includes("putBrandingAssetObject"));
    assert.ok(!photoSrc.includes("TYPESENSE"));
    assert.ok(!manageSrc.includes("ListingSource"));
    assert.ok(!manageSrc.includes("resolveWorkspaceListingEntitlement"));
    assert.ok(!routeSrc.includes("selectable"));
    console.log("[5] Neon-safe + no MLS/Typesense/selectable coupling... PASS");
  }

  console.log("\nstage-6.11e5-team-member-photo:selftest ok\n");
}

main()
  .catch((err) => {
    console.error(err);
    setBrandingStorageTestDeps(null);
    process.exit(1);
  })
  .finally(() => {
    setBrandingStorageTestDeps(null);
  });
