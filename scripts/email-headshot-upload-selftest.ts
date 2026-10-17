/**
 * Phase 3D.3 — agent profile photo + email headshot sibling integration.
 * Run: pnpm email-headshot-upload:selftest
 *
 * Hermetic. No production DB. No real R2 uploads/deletes. No emails.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { OwnerActivationError } from "@/lib/platform/activation/errors";
import {
  AGENT_EMAIL_HEADSHOT_FILENAME_SUFFIX,
  buildAgentEmailHeadshotObjectKey,
  canMutateAgentUserProfilePhoto,
  EMAIL_HEADSHOT_MAX_BYTES,
  EMAIL_HEADSHOT_REQUIRED_SIZE,
  extractAgentUserProfileObjectKeyFromUrl,
  PNG_SIGNATURE,
  pngCrc32,
  setBrandingStorageTestDeps,
  uploadAgentUserProfilePhoto,
  validateEmailHeadshotBytes,
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

function u32be(n: number): Uint8Array {
  return Uint8Array.of(
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  );
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = Uint8Array.from(type.split("").map((c) => c.charCodeAt(0)));
  const crcBuf = new Uint8Array(typeBytes.length + data.length);
  crcBuf.set(typeBytes, 0);
  crcBuf.set(data, typeBytes.length);
  const crc = pngCrc32(crcBuf);
  const out = new Uint8Array(8 + data.length + 4);
  out.set(u32be(data.length), 0);
  out.set(typeBytes, 4);
  out.set(data, 8);
  out.set(u32be(crc), 8 + data.length);
  return out;
}

/** Valid non-interlaced 8-bit RGBA PNG for upload success paths. */
function solidRgbaPng(width: number, height: number): Uint8Array {
  const row = 1 + width * 4;
  const raw = new Uint8Array(height * row);
  for (let y = 0; y < height; y++) {
    const base = y * row;
    raw[base] = 0;
    for (let x = 0; x < width; x++) {
      const p = base + 1 + x * 4;
      raw[p] = 40;
      raw[p + 1] = 90;
      raw[p + 2] = 140;
      raw[p + 3] = 255;
    }
  }
  const ihdr = new Uint8Array(13);
  ihdr.set(u32be(width), 0);
  ihdr.set(u32be(height), 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = deflateSync(Buffer.from(raw), { level: 9 });
  const parts = [
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", new Uint8Array(idat)),
    pngChunk("IEND", new Uint8Array(0)),
  ];
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Legacy forged IHDR-only buffer (must be rejected by 3D.4.0). */
function forgedIhdrOnly(width: number, height: number, padBytes = 0): Uint8Array {
  const buf = new Uint8Array(33 + padBytes);
  buf.set(PNG_SIGNATURE, 0);
  buf[11] = 13;
  buf.set([0x49, 0x48, 0x44, 0x52], 12);
  buf.set(u32be(width), 16);
  buf.set(u32be(height), 20);
  buf[24] = 8;
  buf[25] = 6;
  return buf;
}

function emailHeadshotFile(
  dims: number = EMAIL_HEADSHOT_REQUIRED_SIZE,
): File {
  return new File([solidRgbaPng(dims, dims)], "agent-email-headshot-240.png", {
    type: "image/png",
  });
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
  flipPrimaryDuringTxTo: string | null;
  users: Map<string, { id: string; image: string | null; name: string }>;
  members: Member[];
  brandings: Map<string, BrandingRow>;
  associations: Map<string, HeadshotAssoc>;
  onboardingStatus: string;
  txFailOnce: boolean;
  associationPersistFailOnce: boolean;
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
    associationPersistFailOnce: false,
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
        return row ? { userId: row.userId } : null;
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
        data: Partial<BrandingRow>;
      }) => {
        const row = state.brandings.get(where.workspaceId);
        if (!row) throw new Error("missing branding");
        Object.assign(row, data);
        return row;
      },
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
        create: {
          workspaceId: string;
          userId: string;
          sourceUniqueId: string;
          emailHeadshotObjectKey: string;
        };
        update: {
          sourceUniqueId: string;
          emailHeadshotObjectKey: string;
        };
      }) => {
        if (state.associationPersistFailOnce) {
          state.associationPersistFailOnce = false;
          throw new Error("forced_association_persist_failure");
        }
        const { workspaceId, userId } = where.workspaceId_userId;
        const key = assocKey(workspaceId, userId);
        if (state.associations.has(key)) {
          state.associations.set(key, {
            workspaceId,
            userId,
            sourceUniqueId: update.sourceUniqueId,
            emailHeadshotObjectKey: update.emailHeadshotObjectKey,
          });
        } else {
          state.associations.set(key, {
            workspaceId,
            userId,
            sourceUniqueId: create.sourceUniqueId,
            emailHeadshotObjectKey: create.emailHeadshotObjectKey,
          });
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

type PutRecord = { key: string; contentType?: string; bytes?: Uint8Array };

function useMemoryBucket(opts: {
  puts: PutRecord[];
  deletes: string[];
  failPutKeyIncludes?: string;
}) {
  setBrandingStorageTestDeps({
    isProduction: () => true,
    getPublicBase: () => "https://cdn.example",
    getBucket: async () => ({
      put: async (key, value, options) => {
        const keyStr = String(key);
        if (
          opts.failPutKeyIncludes &&
          keyStr.includes(opts.failPutKeyIncludes)
        ) {
          throw new Error("forced_thumb_put_failure");
        }
        let bytes: Uint8Array | undefined;
        if (value instanceof Uint8Array) bytes = value;
        else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value);
        opts.puts.push({
          key: keyStr,
          contentType: options?.httpMetadata?.contentType,
          bytes,
        });
      },
      delete: async (key) => {
        opts.deletes.push(String(key));
      },
    }),
  });
}

function uniqueIdFromProfileUrl(url: string, userId: string): string {
  const key = extractAgentUserProfileObjectKeyFromUrl(url, WS, userId);
  assert.ok(key);
  const base = key.split("/").pop()!;
  return base.replace(/\.(jpg|jpeg|png|webp)$/i, "");
}

async function main() {
  console.log("\n=== PHASE 3D.3 — EMAIL HEADSHOT UPLOAD INTEGRATION ===\n");

  {
    const photo = read(
      "src/lib/tenancy/branding-assets/agent-user-profile-photo.ts",
    );
    const route = read("src/app/api/agent/profile/photo/route.ts");
    const uploader = read(
      "src/components/agent/AgentPortraitFocusUploader.tsx",
    );
    assert.ok(photo.includes("tryStoreEmailHeadshotSibling"));
    assert.ok(photo.includes("buildAgentEmailHeadshotObjectKey"));
    assert.ok(photo.includes("validateEmailHeadshotBytes"));
    assert.ok(!photo.includes("deleteAgentEmailHeadshot"));
    assert.ok(route.includes('form.get("emailHeadshot")'));
    assert.ok(!route.includes("objectKey"));
    assert.ok(route.includes("emailHeadshotStored"));
    assert.ok(!route.includes("emailHeadshotUrl"));
    assert.ok(uploader.includes("createEmailHeadshotFile"));
    assert.ok(uploader.includes('body.set("emailHeadshot"'));
    assert.ok(!uploader.includes("emailHeadshotUrl"));
    assert.ok(
      canMutateAgentUserProfilePhoto({
        actorUserId: AGENT,
        targetUserId: PRIMARY,
        canManageWorkspace: false,
      }) === false,
    );
    assert.ok(
      canMutateAgentUserProfilePhoto({
        actorUserId: MANAGER,
        targetUserId: AGENT,
        canManageWorkspace: true,
      }) === true,
    );
    console.log("[0] Source invariants + auth helper... PASS");
  }

  // Successful original + thumbnail
  {
    const state = createState(PRIMARY);
    const puts: PutRecord[] = [];
    const deletes: string[] = [];
    useMemoryBucket({ puts, deletes });
    const result = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: PRIMARY,
      file: jpegFile(),
      emailHeadshot: emailHeadshotFile(),
      prisma: mockPrisma(state),
    });
    assert.equal(result.emailHeadshotStored, true);
    assert.ok(result.image?.startsWith("https://cdn.example/"));
    assert.equal(result.image, result.agentProfilePhotoUrl);
    assert.equal(state.users.get(PRIMARY)?.image, result.image);
    assert.equal(result.syncedBrandingPortrait, true);

    const profilePuts = puts.filter(
      (p) => !p.key.includes(AGENT_EMAIL_HEADSHOT_FILENAME_SUFFIX),
    );
    const thumbPuts = puts.filter((p) =>
      p.key.includes(AGENT_EMAIL_HEADSHOT_FILENAME_SUFFIX),
    );
    assert.equal(profilePuts.length, 1);
    assert.equal(thumbPuts.length, 1);
    assert.equal(thumbPuts[0]!.contentType, "image/png");

    const uniqueId = uniqueIdFromProfileUrl(result.image!, PRIMARY);
    const expectedThumb = buildAgentEmailHeadshotObjectKey({
      workspaceId: WS,
      userId: PRIMARY,
      uniqueId,
    });
    assert.equal(thumbPuts[0]!.key, expectedThumb);
    console.log("[1] Original + thumbnail upload... PASS");
  }

  // Thumbnail generation failure (missing field) — original still works
  {
    const state = createState(AGENT);
    const puts: PutRecord[] = [];
    useMemoryBucket({ puts, deletes: [] });
    const result = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: AGENT,
      file: jpegFile(),
      emailHeadshot: null,
      prisma: mockPrisma(state),
    });
    assert.equal(result.emailHeadshotStored, false);
    assert.ok(result.image);
    assert.equal(
      puts.filter((p) => p.key.includes(AGENT_EMAIL_HEADSHOT_FILENAME_SUFFIX))
        .length,
      0,
    );
    console.log("[2] Thumbnail omitted (gen failure path)... PASS");
  }

  // Thumbnail storage failure — original still works
  {
    const state = createState(PRIMARY);
    const puts: PutRecord[] = [];
    useMemoryBucket({
      puts,
      deletes: [],
      failPutKeyIncludes: AGENT_EMAIL_HEADSHOT_FILENAME_SUFFIX,
    });
    const result = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: PRIMARY,
      file: jpegFile(),
      emailHeadshot: emailHeadshotFile(),
      prisma: mockPrisma(state),
    });
    assert.equal(result.emailHeadshotStored, false);
    assert.ok(result.image);
    assert.equal(state.users.get(PRIMARY)?.image, result.image);
    assert.equal(
      puts.filter((p) => p.key.includes(AGENT_EMAIL_HEADSHOT_FILENAME_SUFFIX))
        .length,
      0,
    );
    assert.equal(
      puts.filter(
        (p) => !p.key.includes(AGENT_EMAIL_HEADSHOT_FILENAME_SUFFIX),
      ).length,
      1,
    );
    console.log("[3] Thumbnail storage failure... PASS");
  }

  // Original photo upload failure (TX) — no thumbnail written
  {
    const state = createState(PRIMARY);
    state.txFailOnce = true;
    const puts: PutRecord[] = [];
    const deletes: string[] = [];
    useMemoryBucket({ puts, deletes });
    await assert.rejects(
      () =>
        uploadAgentUserProfilePhoto({
          workspaceId: WS,
          userId: PRIMARY,
          file: jpegFile(),
          emailHeadshot: emailHeadshotFile(),
          prisma: mockPrisma(state),
        }),
      /forced_tx_failure/,
    );
    assert.ok(puts.length >= 1);
    assert.equal(
      puts.filter((p) => p.key.includes(AGENT_EMAIL_HEADSHOT_FILENAME_SUFFIX))
        .length,
      0,
    );
    assert.ok(deletes.includes(puts[0]!.key));
    console.log("[4] Original upload failure (no thumb)... PASS");
  }

  // Unauthorized / non-member + cross-tenant
  {
    const state = createState(PRIMARY);
    useMemoryBucket({ puts: [], deletes: [] });
    await assert.rejects(
      () =>
        uploadAgentUserProfilePhoto({
          workspaceId: WS,
          userId: OUTSIDER,
          file: jpegFile(),
          emailHeadshot: emailHeadshotFile(),
          prisma: mockPrisma(state),
        }),
      (err: unknown) =>
        err instanceof OwnerActivationError && err.code === "NOT_FOUND",
    );
    // Outsider workspace cannot upload for PRIMARY
    await assert.rejects(
      () =>
        uploadAgentUserProfilePhoto({
          workspaceId: WS_B,
          userId: PRIMARY,
          file: jpegFile(),
          emailHeadshot: emailHeadshotFile(),
          prisma: mockPrisma(state),
        }),
      (err: unknown) =>
        err instanceof OwnerActivationError && err.code === "NOT_FOUND",
    );
    console.log("[5] Unauthorized + cross-tenant... PASS");
  }

  // Incorrect MIME / dimensions / oversized
  {
    const jpegAsThumb = new File([agentProfileJpeg()], "bad.png", {
      type: "image/png",
    });
    const badMime = validateEmailHeadshotBytes(await jpegAsThumb.arrayBuffer());
    assert.ok("code" in badMime && badMime.code === "UNSUPPORTED_MIME");

    const wrongDims = validateEmailHeadshotBytes(solidRgbaPng(100, 100));
    assert.ok(
      "code" in wrongDims && wrongDims.code === "DIMENSIONS_INVALID",
    );

    const oversized = validateEmailHeadshotBytes(
      forgedIhdrOnly(240, 240, EMAIL_HEADSHOT_MAX_BYTES),
    );
    assert.ok("code" in oversized && oversized.code === "FILE_TOO_LARGE");

    const forged = validateEmailHeadshotBytes(forgedIhdrOnly(240, 240));
    assert.ok("code" in forged && forged.code === "CORRUPT_IMAGE");

    const state = createState(AGENT);
    const puts: PutRecord[] = [];
    useMemoryBucket({ puts, deletes: [] });
    const result = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: AGENT,
      file: jpegFile(),
      emailHeadshot: jpegAsThumb,
      prisma: mockPrisma(state),
    });
    assert.equal(result.emailHeadshotStored, false);
    assert.ok(result.image);
    assert.equal(
      puts.filter((p) => p.key.includes(AGENT_EMAIL_HEADSHOT_FILENAME_SUFFIX))
        .length,
      0,
    );
    console.log("[6] MIME / dimensions / size validation... PASS");
  }

  // Profile photo replacement — previous original may delete; no thumb delete
  {
    const state = createState(PRIMARY);
    const puts: PutRecord[] = [];
    const deletes: string[] = [];
    useMemoryBucket({ puts, deletes });
    const first = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: PRIMARY,
      file: jpegFile(),
      emailHeadshot: emailHeadshotFile(),
      prisma: mockPrisma(state),
    });
    assert.equal(first.emailHeadshotStored, true);
    const firstKey = extractAgentUserProfileObjectKeyFromUrl(
      first.image!,
      WS,
      PRIMARY,
    )!;
    const deletesAfterFirst = deletes.length;

    const second = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: PRIMARY,
      file: jpegFile(),
      emailHeadshot: emailHeadshotFile(),
      prisma: mockPrisma(state),
    });
    assert.equal(second.emailHeadshotStored, true);
    assert.notEqual(second.image, first.image);
    // Previous original may be deleted; email-240 keys must never be.
    assert.ok(
      deletes.slice(deletesAfterFirst).every(
        (k) => !k.includes(AGENT_EMAIL_HEADSHOT_FILENAME_SUFFIX),
      ),
    );
    // First original key may appear in deletes (unreferenced); thumbs must not.
    void firstKey;
    const thumbDeletes = deletes.filter((k) =>
      k.includes(AGENT_EMAIL_HEADSHOT_FILENAME_SUFFIX),
    );
    assert.equal(thumbDeletes.length, 0);
    console.log("[7] Replacement without thumb deletion... PASS");
  }

  // Primary-agent branding dual-write still works with thumb
  {
    const state = createState(PRIMARY);
    useMemoryBucket({ puts: [], deletes: [] });
    const result = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: PRIMARY,
      file: jpegFile(),
      emailHeadshot: emailHeadshotFile(),
      prisma: mockPrisma(state),
    });
    assert.equal(result.syncedBrandingPortrait, true);
    assert.equal(
      state.brandings.get(WS)?.agentProfilePhotoUrl,
      result.image,
    );
    // Non-primary: no branding write
    const state2 = createState(PRIMARY);
    useMemoryBucket({ puts: [], deletes: [] });
    const nonPrimary = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: AGENT,
      file: jpegFile(),
      emailHeadshot: emailHeadshotFile(),
      prisma: mockPrisma(state2),
    });
    assert.equal(nonPrimary.syncedBrandingPortrait, false);
    assert.equal(nonPrimary.emailHeadshotStored, true);
    console.log("[8] Primary branding dual-write + non-primary... PASS");
  }

  // No signature preference / no derived URL in API contract sources
  {
    const route = read("src/app/api/agent/profile/photo/route.ts");
    const photo = read(
      "src/lib/tenancy/branding-assets/agent-user-profile-photo.ts",
    );
    assert.ok(!route.includes("emailHeadshotUrl"));
    assert.ok(!route.includes("preferredAgent"));
    assert.ok(!route.includes("buildAgentEmailSignature"));
    assert.ok(!photo.includes("preferredAgent"));
    assert.ok(!photo.includes("emailHeadshotUrl"));
    assert.ok(!photo.includes("buildAgentEmailSignature"));
    assert.ok(photo.includes("emailHeadshotStored"));
    assert.ok(route.includes("emailHeadshotStored"));
    console.log("[9] No signature preference before existence... PASS");
  }

  setBrandingStorageTestDeps(null);
  console.log("\nAll email-headshot-upload selftests passed.\n");
}

main().catch((err) => {
  console.error(err);
  setBrandingStorageTestDeps(null);
  process.exitCode = 1;
});
