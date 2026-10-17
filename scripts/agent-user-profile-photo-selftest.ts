/**
 * Phase 1 — per-agent User.image profile photo (+ safety corrections).
 * Run: pnpm agent-user-profile-photo:selftest
 *
 * Hermetic. No production DB. No real R2 uploads.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentOrgContext } from "@/lib/agent";
import { loadWorkspaceAgentProfile } from "@/lib/agent/admin-managed-profile";
import { OwnerActivationError } from "@/lib/platform/activation/errors";
import {
  buildAgentUserProfileObjectKey,
  canMutateAgentUserProfilePhoto,
  deleteManagedAgentProfileUrlIfUnreferenced,
  extractAgentUserProfileObjectKeyFromUrl,
  extractManagedProfileObjectKeyFromUrl,
  removeAgentUserProfilePhoto,
  setBrandingStorageTestDeps,
  uploadAgentUserProfilePhoto,
  validateBrandingImageBytes,
} from "@/lib/tenancy/branding-assets";
import type { PrismaClient } from "@prisma/client";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS = "ws_photo_a";
const WS_B = "ws_photo_b";
const PRIMARY = "user_primary";
const AGENT = "user_agent";
const OWNER = "user_owner";
const MANAGER = "user_admin";
const OUTSIDER = "user_outsider";

/** Minimal JPEG SOF0 400×500 for agent-profile validation. */
function agentProfileJpeg(): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
    0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x01,
    0xf4, 0x01, 0x90, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9,
  ]);
}

function jpegFile(): File {
  return new File([agentProfileJpeg()], "agent.jpg", { type: "image/jpeg" });
}

type Member = {
  workspaceId: string;
  userId: string;
  status: "ACTIVE" | "REMOVED";
  role: "OWNER" | "ADMIN" | "AGENT";
};

type BrandingRow = {
  agentProfilePhotoUrl: string | null;
  logoUrl: string | null;
  brokerageLogoUrl: string | null;
  faviconUrl: string | null;
  themeId: string | null;
  version: number;
};

type HeadshotAssoc = {
  workspaceId: string;
  userId: string;
  sourceUniqueId: string;
  emailHeadshotObjectKey: string;
};

type State = {
  primaryAgentId: string | null;
  /** When set, flip primaryAgentId to this value inside $transaction before $executeRaw. */
  flipPrimaryDuringTxTo: string | null;
  users: Map<string, { id: string; image: string | null; name: string }>;
  members: Member[];
  brandings: Map<string, BrandingRow>;
  associations: Map<string, HeadshotAssoc>;
  onboardingStatus: string;
  txFailOnce: boolean;
};

function createState(primaryAgentId: string | null): State {
  return {
    primaryAgentId,
    flipPrimaryDuringTxTo: null,
    users: new Map([
      [PRIMARY, { id: PRIMARY, image: null, name: "Primary Agent" }],
      [AGENT, { id: AGENT, image: null, name: "Other Agent" }],
      [OWNER, { id: OWNER, image: null, name: "Owner" }],
      [MANAGER, { id: MANAGER, image: null, name: "Admin" }],
      [OUTSIDER, { id: OUTSIDER, image: null, name: "Outsider" }],
    ]),
    members: [
      { workspaceId: WS, userId: OWNER, status: "ACTIVE", role: "OWNER" },
      { workspaceId: WS, userId: PRIMARY, status: "ACTIVE", role: "AGENT" },
      { workspaceId: WS, userId: AGENT, status: "ACTIVE", role: "AGENT" },
      { workspaceId: WS, userId: MANAGER, status: "ACTIVE", role: "ADMIN" },
      { workspaceId: WS_B, userId: OUTSIDER, status: "ACTIVE", role: "OWNER" },
    ],
    brandings: new Map([
      [
        WS,
        {
          agentProfilePhotoUrl:
            "https://cdn.example/workspaces/ws_photo_a/branding/agent-profile/legacy.jpg",
          logoUrl: null,
          brokerageLogoUrl: null,
          faviconUrl: null,
          themeId: "agent-signature",
          version: 1,
        },
      ],
      [
        WS_B,
        {
          agentProfilePhotoUrl: null,
          logoUrl: null,
          brokerageLogoUrl: null,
          faviconUrl: null,
          themeId: null,
          version: 1,
        },
      ],
    ]),
    associations: new Map(),
    onboardingStatus: "COMPLETE",
    txFailOnce: false,
  };
}

function assocKey(workspaceId: string, userId: string) {
  return `${workspaceId}::${userId}`;
}

function mockPrisma(state: State): PrismaClient {
  const db = {
    workspace: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id === WS) return { primaryAgentId: state.primaryAgentId };
        if (where.id === WS_B) return { primaryAgentId: OUTSIDER };
        return null;
      },
    },
    workspaceMember: {
      findFirst: async ({
        where,
      }: {
        where: {
          workspaceId: string;
          userId: string;
          status?: string;
          role?: { in: string[] };
        };
      }) => {
        const row = state.members.find(
          (m) =>
            m.workspaceId === where.workspaceId &&
            m.userId === where.userId &&
            (!where.status || m.status === where.status) &&
            (!where.role?.in || where.role.in.includes(m.role)),
        );
        if (!row) return null;
        const user = state.users.get(row.userId);
        if (!user) return null;
        return {
          id: `mem_${row.userId}`,
          ...row,
          user: {
            id: user.id,
            name: user.name,
            email: `${user.id}@example.com`,
            phone: "4165550100",
            phoneE164: "+14165550100",
            image: user.image,
            agentProfile: {
              firstName: user.name.split(" ")[0] ?? null,
              lastName: user.name.split(" ").slice(1).join(" ") || null,
              phone: "4165550100",
              recoLicenseNumber: "123",
              recoLicenseExpiresAt: new Date("2030-01-01T12:00:00.000Z"),
            },
          },
        };
      },
    },
    workspaceBranding: {
      findUnique: async ({ where }: { where: { workspaceId: string } }) => {
        const row = state.brandings.get(where.workspaceId);
        return row ? { ...row } : null;
      },
      findFirst: async ({
        where,
      }: {
        where: {
          agentProfilePhotoUrl: string;
          workspaceId?: { notIn: string[] };
        };
      }) => {
        for (const [workspaceId, row] of state.brandings) {
          if (row.agentProfilePhotoUrl !== where.agentProfilePhotoUrl) continue;
          if (where.workspaceId?.notIn?.includes(workspaceId)) continue;
          return { workspaceId };
        }
        return null;
      },
      update: async ({
        where,
        data,
      }: {
        where: { workspaceId: string };
        data: {
          agentProfilePhotoUrl?: string | null;
          version?: { increment: number };
        };
      }) => {
        const row = state.brandings.get(where.workspaceId);
        if (!row) throw new Error("bad workspace");
        if ("agentProfilePhotoUrl" in data) {
          row.agentProfilePhotoUrl = data.agentProfilePhotoUrl ?? null;
        }
        if (data.version?.increment) {
          row.version += data.version.increment;
        }
        return { ...row };
      },
    },
    workspaceProfessionalIdentity: {
      findUnique: async () => ({ agentDesignation: "Sales Representative" }),
    },
    workspaceOnboardingState: {
      findUnique: async ({ where }: { where: { workspaceId: string } }) =>
        where.workspaceId === WS
          ? { workspaceId: WS, brandingStatus: state.onboardingStatus }
          : null,
      create: async () => ({
        workspaceId: WS,
        brandingStatus: "NOT_STARTED",
      }),
      update: async ({
        data,
      }: {
        where: { workspaceId: string };
        data: { brandingStatus: string };
      }) => {
        state.onboardingStatus = data.brandingStatus;
        return { brandingStatus: state.onboardingStatus };
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const u = state.users.get(where.id);
        return u ? { id: u.id, image: u.image } : null;
      },
      findFirst: async ({
        where,
      }: {
        where: {
          image: string;
          id?: { not: string; notIn?: string[] };
        };
      }) => {
        const notIn = where.id?.notIn ?? [];
        const not = where.id?.not;
        for (const u of state.users.values()) {
          if (u.image !== where.image) continue;
          if (not && u.id === not) continue;
          if (notIn.includes(u.id)) continue;
          return { id: u.id };
        }
        return null;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { image: string | null };
      }) => {
        const u = state.users.get(where.id);
        if (!u) throw new Error("missing user");
        u.image = data.image;
        return { id: u.id, image: u.image };
      },
    },
    agentEmailHeadshot: {
      deleteMany: async ({
        where,
      }: {
        where: { workspaceId: string; userId: string };
      }) => {
        const key = assocKey(where.workspaceId, where.userId);
        const existed = state.associations.delete(key);
        return { count: existed ? 1 : 0 };
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { workspaceId_userId: { workspaceId: string; userId: string } };
        create: HeadshotAssoc & { id: string };
        update: {
          sourceUniqueId: string;
          emailHeadshotObjectKey: string;
        };
      }) => {
        const { workspaceId, userId } = where.workspaceId_userId;
        const key = assocKey(workspaceId, userId);
        const next = {
          workspaceId,
          userId,
          sourceUniqueId: create.sourceUniqueId ?? update.sourceUniqueId,
          emailHeadshotObjectKey:
            create.emailHeadshotObjectKey ?? update.emailHeadshotObjectKey,
        };
        if (state.associations.has(key)) {
          state.associations.set(key, {
            workspaceId,
            userId,
            sourceUniqueId: update.sourceUniqueId,
            emailHeadshotObjectKey: update.emailHeadshotObjectKey,
          });
        } else {
          state.associations.set(key, next);
        }
        return state.associations.get(key);
      },
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      if (sql.includes("FOR UPDATE") && sql.includes('"User"')) {
        const userId = String(values[0] ?? "");
        const u = state.users.get(userId);
        return u ? [{ id: u.id, image: u.image }] : [];
      }
      return [];
    },
    $executeRaw: async (
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => {
      const sql = strings.join("?");
      // Mimic: UPDATE branding FROM workspace WHERE primaryAgentId = userId
      assert.ok(sql.includes("WorkspaceBranding"));
      const workspaceId = String(values[1] ?? "");
      const userId = String(values[2] ?? "");
      const nextUrl = String(values[0] ?? "");
      if (state.flipPrimaryDuringTxTo) {
        state.primaryAgentId = state.flipPrimaryDuringTxTo;
        state.flipPrimaryDuringTxTo = null;
      }
      if (state.primaryAgentId !== userId) return 0;
      const row = state.brandings.get(workspaceId);
      if (!row) return 0;
      row.agentProfilePhotoUrl = nextUrl;
      row.version += 1;
      return 1;
    },
    $transaction: async (fn: (tx: typeof db) => Promise<unknown>) => {
      if (state.txFailOnce) {
        state.txFailOnce = false;
        throw new Error("forced_tx_failure");
      }
      return fn(db);
    },
  };
  return db as unknown as PrismaClient;
}

function agentCtx(
  userId: string,
  opts?: { canManageWorkspace?: boolean; workspaceId?: string },
): AgentOrgContext {
  return {
    user: {
      id: userId,
      email: `${userId}@example.com`,
      name: userId,
      image: null,
      role: "AGENT",
      phone: null,
    },
    organizationId: "org",
    organizationName: "org",
    organizationIds: ["org"],
    workspaceId: opts?.workspaceId ?? WS,
    workspaceRole:
      userId === OWNER ? "OWNER" : userId === MANAGER ? "ADMIN" : "AGENT",
    canManageWorkspace: opts?.canManageWorkspace ?? false,
    canSeeTeamLeads: true,
    membershipRole: "AGENT",
    isPlatformAdmin: false,
    workspaceMemberStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
    workspaceName: "ws",
    isWorkspaceMember: true,
    isWorkspaceCrmAllowed: true,
    hasAmbiguousWorkspaceMembership: false,
    hasMultipleWorkspaces: false,
    requiresWorkspaceSelection: false,
    readScope: "workspace",
  } as AgentOrgContext;
}

function useMemoryBucket(deletes: string[], puts: string[]) {
  setBrandingStorageTestDeps({
    isProduction: () => true,
    getPublicBase: () => "https://cdn.example",
    getBucket: async () => ({
      put: async (key) => {
        puts.push(String(key));
      },
      delete: async (key) => {
        deletes.push(String(key));
      },
    }),
  });
}

async function main() {
  console.log("\n=== PHASE 1 — AGENT USER PROFILE PHOTO (SAFETY) ===\n");

  {
    const photoMod = read(
      "src/lib/tenancy/branding-assets/agent-user-profile-photo.ts",
    );
    const manage = read("src/lib/tenancy/branding-assets/manage.ts");
    const cdn = read("src/lib/tenancy/branding-assets/managed-profile-cdn.ts");
    const publicId = read("src/lib/tenancy/resolve-public-agent-identity.ts");
    assert.ok(photoMod.includes("does NOT clear WorkspaceBranding"));
    assert.ok(photoMod.includes("primaryAgentId"));
    assert.ok(manage.includes("deleteManagedAgentProfileUrlIfUnreferenced"));
    assert.ok(cdn.includes("User.image"));
    assert.ok(publicId.includes("Never User.image"));
    console.log("[0] Source invariants... PASS");
  }

  {
    const key = buildAgentUserProfileObjectKey({
      workspaceId: WS,
      userId: PRIMARY,
      uniqueId: "abc123",
      ext: "jpg",
    });
    assert.equal(
      extractAgentUserProfileObjectKeyFromUrl(
        `https://cdn.example/${key}`,
        WS,
      ),
      key,
    );
    assert.equal(
      extractManagedProfileObjectKeyFromUrl(`https://cdn.example/${key}`, WS_B),
      null,
    );
    assert.equal(
      canMutateAgentUserProfilePhoto({
        actorUserId: AGENT,
        targetUserId: PRIMARY,
        canManageWorkspace: false,
      }),
      false,
    );
    assert.equal(
      canMutateAgentUserProfilePhoto({
        actorUserId: MANAGER,
        targetUserId: AGENT,
        canManageWorkspace: true,
      }),
      true,
    );
    const bad = validateBrandingImageBytes(
      Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
      "agent-profile",
    );
    assert.ok("code" in bad);
    console.log("[H] Auth helpers + key isolation + validation... PASS");
  }

  // Primary dual-write baseline
  {
    const state = createState(PRIMARY);
    const deletes: string[] = [];
    const puts: string[] = [];
    useMemoryBucket(deletes, puts);
    const result = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: PRIMARY,
      file: jpegFile(),
      prisma: mockPrisma(state),
    });
    assert.equal(result.syncedBrandingPortrait, true);
    assert.equal(state.users.get(PRIMARY)?.image, result.image);
    assert.equal(
      state.brandings.get(WS)?.agentProfilePhotoUrl,
      result.image,
    );
    assert.equal(state.users.get(AGENT)?.image, null);
    console.log("[dual-write] Primary sync... PASS");
  }

  // A — dual-write then onboarding remove: retain CDN + User.image
  {
    const state = createState(PRIMARY);
    const deletes: string[] = [];
    useMemoryBucket(deletes, []);
    const uploaded = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: PRIMARY,
      file: jpegFile(),
      prisma: mockPrisma(state),
    });
    const shared = uploaded.image!;
    const deletesAfterUpload = deletes.length;
    // Simulate onboarding clearing branding column then attempting CDN delete.
    state.brandings.get(WS)!.agentProfilePhotoUrl = null;
    const del = await deleteManagedAgentProfileUrlIfUnreferenced({
      url: shared,
      workspaceId: WS,
      prisma: mockPrisma(state),
    });
    assert.equal(del, "retained_referenced");
    assert.equal(deletes.length, deletesAfterUpload);
    assert.equal(state.users.get(PRIMARY)?.image, shared);
    console.log("[A] Onboarding remove retains shared CDN... PASS");
  }

  // B — dual-write then onboarding replace: old object retained
  {
    const state = createState(PRIMARY);
    const deletes: string[] = [];
    useMemoryBucket(deletes, []);
    const uploaded = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: PRIMARY,
      file: jpegFile(),
      prisma: mockPrisma(state),
    });
    const oldUrl = uploaded.image!;
    const deletesAfterUpload = deletes.length;
    state.brandings.get(WS)!.agentProfilePhotoUrl =
      "https://cdn.example/workspaces/ws_photo_a/branding/agent-profile/new.jpg";
    const del = await deleteManagedAgentProfileUrlIfUnreferenced({
      url: oldUrl,
      workspaceId: WS,
      prisma: mockPrisma(state),
    });
    assert.equal(del, "retained_referenced");
    assert.equal(deletes.length, deletesAfterUpload);
    assert.equal(state.users.get(PRIMARY)?.image, oldUrl);
    console.log("[B] Onboarding replace retains User.image CDN... PASS");
  }

  // C — unreferenced branding object deletable
  {
    const state = createState(PRIMARY);
    const deletes: string[] = [];
    useMemoryBucket(deletes, []);
    const orphan =
      "https://cdn.example/workspaces/ws_photo_a/branding/agent-profile/orphan.jpg";
    state.brandings.get(WS)!.agentProfilePhotoUrl = null;
    for (const u of state.users.values()) u.image = null;
    const del = await deleteManagedAgentProfileUrlIfUnreferenced({
      url: orphan,
      workspaceId: WS,
      prisma: mockPrisma(state),
    });
    assert.equal(del, "deleted");
    assert.ok(deletes.some((k) => k.includes("orphan")));
    console.log("[C] Unreferenced object deleted... PASS");
  }

  // D — primary User.image remove does not blank website branding
  {
    const state = createState(PRIMARY);
    const deletes: string[] = [];
    useMemoryBucket(deletes, []);
    const uploaded = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: PRIMARY,
      file: jpegFile(),
      prisma: mockPrisma(state),
    });
    const portrait = uploaded.image!;
    const deletesAfterUpload = deletes.length;
    const removed = await removeAgentUserProfilePhoto({
      workspaceId: WS,
      userId: PRIMARY,
      prisma: mockPrisma(state),
    });
    assert.equal(removed.syncedBrandingPortrait, false);
    assert.equal(state.users.get(PRIMARY)?.image, null);
    assert.equal(state.brandings.get(WS)?.agentProfilePhotoUrl, portrait);
    // Shared portrait still on branding → CDN retained.
    assert.equal(deletes.length, deletesAfterUpload);
    console.log("[D] Primary remove preserves website portrait... PASS");
  }

  // E — non-primary remove does not affect branding
  {
    const state = createState(PRIMARY);
    const brandingBefore = state.brandings.get(WS)!.agentProfilePhotoUrl;
    useMemoryBucket([], []);
    await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: AGENT,
      file: jpegFile(),
      prisma: mockPrisma(state),
    });
    await removeAgentUserProfilePhoto({
      workspaceId: WS,
      userId: AGENT,
      prisma: mockPrisma(state),
    });
    assert.equal(
      state.brandings.get(WS)?.agentProfilePhotoUrl,
      brandingBefore,
    );
    console.log("[E] Non-primary remove leaves branding... PASS");
  }

  // F — cross-workspace shared reference retention
  {
    const state = createState(PRIMARY);
    const deletes: string[] = [];
    useMemoryBucket(deletes, []);
    const shared =
      "https://cdn.example/workspaces/ws_photo_a/agents/user_primary/profile/shared.jpg";
    state.users.get(PRIMARY)!.image = shared;
    state.brandings.get(WS)!.agentProfilePhotoUrl = null;
    // Another workspace's branding still points at the same URL.
    state.brandings.get(WS_B)!.agentProfilePhotoUrl = shared;
    const del = await deleteManagedAgentProfileUrlIfUnreferenced({
      url: shared,
      workspaceId: WS,
      prisma: mockPrisma(state),
    });
    assert.equal(del, "retained_referenced");
    assert.equal(deletes.length, 0);

    // Wrong workspaceId cannot extract/delete another tenant key.
    const wrongWs = await deleteManagedAgentProfileUrlIfUnreferenced({
      url: shared,
      workspaceId: WS_B,
      prisma: mockPrisma(state),
    });
    assert.equal(wrongWs, "skipped");
    console.log("[F] Cross-workspace shared-reference safety... PASS");
  }

  // G — primary reassignment during upload cannot overwrite branding
  {
    const state = createState(PRIMARY);
    const brandingBefore = state.brandings.get(WS)!.agentProfilePhotoUrl;
    useMemoryBucket([], []);
    state.flipPrimaryDuringTxTo = AGENT;
    const result = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: PRIMARY,
      file: jpegFile(),
      prisma: mockPrisma(state),
    });
    assert.equal(result.syncedBrandingPortrait, false);
    assert.equal(state.users.get(PRIMARY)?.image, result.image);
    assert.equal(
      state.brandings.get(WS)?.agentProfilePhotoUrl,
      brandingBefore,
    );
    assert.equal(state.primaryAgentId, AGENT);
    console.log("[G] Stale primary cannot dual-write branding... PASS");
  }

  // null primary — no OWNER inference
  {
    const state = createState(null);
    const brandingBefore = state.brandings.get(WS)!.agentProfilePhotoUrl;
    useMemoryBucket([], []);
    const result = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: OWNER,
      file: jpegFile(),
      prisma: mockPrisma(state),
    });
    assert.equal(result.syncedBrandingPortrait, false);
    assert.equal(result.primaryAgentUnset, true);
    assert.equal(
      state.brandings.get(WS)?.agentProfilePhotoUrl,
      brandingBefore,
    );
    console.log("[null-primary] No OWNER inference... PASS");
  }

  // CRM display + manager canEditPhoto
  {
    const state = createState(PRIMARY);
    state.brandings.get(WS)!.agentProfilePhotoUrl =
      "https://cdn.example/branding/primary-only.jpg";
    state.users.get(PRIMARY)!.image =
      "https://cdn.example/agents/primary.jpg";
    const db = mockPrisma(state);
    const agentView = await loadWorkspaceAgentProfile(agentCtx(AGENT), AGENT, db);
    assert.ok(agentView.ok);
    assert.equal(agentView.profile.photoUrl, null);
    assert.equal(agentView.profile.canEditPhoto, true);
    const managerOnAgent = await loadWorkspaceAgentProfile(
      agentCtx(MANAGER, { canManageWorkspace: true }),
      AGENT,
      db,
    );
    assert.ok(managerOnAgent.ok);
    assert.equal(managerOnAgent.profile.canEditPhoto, true);
    console.log("[CRM] Per-agent photo, no branding inheritance... PASS");
  }

  // Cross-workspace upload reject + TX compensate
  {
    const state = createState(PRIMARY);
    useMemoryBucket([], []);
    await assert.rejects(
      () =>
        uploadAgentUserProfilePhoto({
          workspaceId: WS,
          userId: OUTSIDER,
          file: jpegFile(),
          prisma: mockPrisma(state),
        }),
      (err: unknown) =>
        err instanceof OwnerActivationError && err.code === "NOT_FOUND",
    );

    state.txFailOnce = true;
    const deletes: string[] = [];
    const puts: string[] = [];
    useMemoryBucket(deletes, puts);
    await assert.rejects(
      () =>
        uploadAgentUserProfilePhoto({
          workspaceId: WS,
          userId: PRIMARY,
          file: jpegFile(),
          prisma: mockPrisma(state),
        }),
      /forced_tx_failure/,
    );
    assert.ok(puts.length >= 1);
    assert.ok(deletes.includes(puts[0]!));
    console.log("[tenant] Cross-workspace reject + TX compensate... PASS");
  }

  // manage.ts wires safe delete for agent-profile
  {
    const manage = read("src/lib/tenancy/branding-assets/manage.ts");
    assert.ok(manage.includes("deletePreviousBrandingAssetSafely"));
    assert.ok(manage.includes('kind === "agent-profile"'));
    console.log("[onboarding-wire] Safe agent-profile CDN delete... PASS");
  }

  setBrandingStorageTestDeps(null);
  console.log("\nAll agent-user-profile-photo safety selftests passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
