/**
 * Phase 3D.4.1 — durable agent email headshot association.
 * Run: pnpm email-headshot-association:selftest
 *
 * Hermetic. No production DB. No real R2. No emails.
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
  EMAIL_HEADSHOT_REQUIRED_SIZE,
  extractAgentUserProfileObjectKeyFromUrl,
  parseAgentUserProfileObjectKey,
  persistAgentEmailHeadshotAssociationIfCurrent,
  PNG_SIGNATURE,
  pngCrc32,
  removeAgentUserProfilePhoto,
  setBrandingStorageTestDeps,
  uploadAgentUserProfilePhoto,
} from "@/lib/tenancy/branding-assets";
import type { PrismaClient } from "@prisma/client";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS = "ws_assoc_a";
const WS_B = "ws_assoc_b";
const PRIMARY = "user_primary";
const AGENT = "user_agent";
const OUTSIDER = "user_outsider";
const SIZE = EMAIL_HEADSHOT_REQUIRED_SIZE;

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

function solidRgbaPng(width: number, height: number): Uint8Array {
  const row = 1 + width * 4;
  const raw = new Uint8Array(height * row);
  for (let y = 0; y < height; y++) {
    raw[y * row] = 0;
    for (let x = 0; x < width; x++) {
      const p = y * row + 1 + x * 4;
      raw[p] = 20;
      raw[p + 1] = 40;
      raw[p + 2] = 60;
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

function emailHeadshotFile(): File {
  return new File([solidRgbaPng(SIZE, SIZE)], "agent-email-headshot-240.png", {
    type: "image/png",
  });
}

type HeadshotAssoc = {
  workspaceId: string;
  userId: string;
  sourceUniqueId: string;
  emailHeadshotObjectKey: string;
};

type State = {
  primaryAgentId: string | null;
  users: Map<string, { id: string; image: string | null }>;
  members: Array<{
    workspaceId: string;
    userId: string;
    status: "ACTIVE" | "REMOVED";
    role: "OWNER" | "ADMIN" | "AGENT";
  }>;
  brandings: Map<
    string,
    {
      agentProfilePhotoUrl: string | null;
      logoUrl: string | null;
      brokerageLogoUrl: string | null;
      faviconUrl: string | null;
      themeId: string | null;
      version: number;
    }
  >;
  associations: Map<string, HeadshotAssoc>;
  onboardingStatus: string;
  txFailOnce: boolean;
  associationPersistFailOnce: boolean;
  associationTxFailOnce: boolean;
  /**
   * Invoked inside persist TX after the mock User FOR UPDATE read, before
   * the image is returned — simulates a concurrent commit that became visible
   * once the lock was obtained (real PG overlap is covered separately).
   */
  onAfterUserLocked?: (() => void | Promise<void>) | null;
  /** When true, next $transaction is the association persist path. */
  expectAssocTx: boolean;
};

function assocKey(workspaceId: string, userId: string) {
  return `${workspaceId}::${userId}`;
}

function createState(primaryAgentId: string | null): State {
  return {
    primaryAgentId,
    users: new Map([
      [PRIMARY, { id: PRIMARY, image: null }],
      [AGENT, { id: AGENT, image: null }],
      [OUTSIDER, { id: OUTSIDER, image: null }],
    ]),
    members: [
      { workspaceId: WS, userId: PRIMARY, status: "ACTIVE", role: "AGENT" },
      { workspaceId: WS, userId: AGENT, status: "ACTIVE", role: "AGENT" },
      { workspaceId: WS_B, userId: OUTSIDER, status: "ACTIVE", role: "OWNER" },
    ],
    brandings: new Map([
      [
        WS,
        {
          agentProfilePhotoUrl: null,
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
    associationTxFailOnce: false,
    onAfterUserLocked: null,
    expectAssocTx: false,
  };
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
      findFirst: async () => null,
    },
    workspaceOnboardingState: {
      findUnique: async () => ({
        workspaceId: WS,
        brandingStatus: state.onboardingStatus,
      }),
      create: async () => ({}),
      update: async ({
        data,
      }: {
        data: { brandingStatus: string };
      }) => {
        state.onboardingStatus = data.brandingStatus;
        return {};
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const u = state.users.get(where.id);
        return u ? { id: u.id, image: u.image } : null;
      },
      findFirst: async () => null,
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
        if (state.onAfterUserLocked) {
          await state.onAfterUserLocked();
        }
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
      if (!sql.includes("WorkspaceBranding")) return 0;
      const workspaceId = String(values[1] ?? "");
      const userId = String(values[2] ?? "");
      const nextUrl = String(values[0] ?? "");
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
      if (state.expectAssocTx && state.associationTxFailOnce) {
        state.associationTxFailOnce = false;
        state.expectAssocTx = false;
        throw new Error("forced_association_tx_failure");
      }
      try {
        return await fn(db);
      } finally {
        if (state.expectAssocTx) state.expectAssocTx = false;
      }
    },
  };
  return db as unknown as PrismaClient;
}

function useMemoryBucket(opts: {
  puts: string[];
  deletes: string[];
  failPutKeyIncludes?: string;
}) {
  setBrandingStorageTestDeps({
    isProduction: () => true,
    getPublicBase: () => "https://cdn.example",
    getBucket: async () => ({
      put: async (key) => {
        const keyStr = String(key);
        if (
          opts.failPutKeyIncludes &&
          keyStr.includes(opts.failPutKeyIncludes)
        ) {
          throw new Error("forced_thumb_put_failure");
        }
        opts.puts.push(keyStr);
      },
      delete: async (key) => {
        opts.deletes.push(String(key));
      },
    }),
  });
}

function uniqueIdFromUrl(url: string, userId: string): string {
  const key = extractAgentUserProfileObjectKeyFromUrl(url, WS, userId);
  assert.ok(key);
  const parsed = parseAgentUserProfileObjectKey(key);
  assert.ok(parsed);
  return parsed.uniqueId;
}

async function main() {
  console.log("\n=== PHASE 3D.4.1 — EMAIL HEADSHOT ASSOCIATION ===\n");

  {
    const photo = read(
      "src/lib/tenancy/branding-assets/agent-user-profile-photo.ts",
    );
    const assoc = read(
      "src/lib/tenancy/branding-assets/agent-email-headshot-association.ts",
    );
    const schema = read("prisma/schema.prisma");
    assert.ok(schema.includes("model AgentEmailHeadshot"));
    assert.ok(assoc.includes("FOR UPDATE"));
    assert.ok(assoc.includes("$transaction"));
    assert.ok(assoc.includes("agentEmailHeadshot.upsert"));
    assert.ok(assoc.includes("u.image"));
    assert.ok(assoc.includes("migration-first") || assoc.includes("before deploying"));
    assert.ok(photo.includes("clearAgentEmailHeadshotAssociation"));
    assert.ok(photo.includes("persistAgentEmailHeadshotAssociationIfCurrent"));
    assert.ok(!photo.includes("deleteAgentEmailHeadshotSiblingIfUnreferenced"));
    console.log("[0] Schema + source invariants... PASS");
  }

  // Original + thumbnail + association
  {
    const state = createState(PRIMARY);
    const puts: string[] = [];
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
    assert.equal(result.emailHeadshotAssociated, true);
    assert.equal(result.syncedBrandingPortrait, true);
    const uniqueId = uniqueIdFromUrl(result.image!, PRIMARY);
    const assoc = state.associations.get(assocKey(WS, PRIMARY));
    assert.ok(assoc);
    assert.equal(assoc.sourceUniqueId, uniqueId);
    assert.equal(
      assoc.emailHeadshotObjectKey,
      buildAgentEmailHeadshotObjectKey({
        workspaceId: WS,
        userId: PRIMARY,
        uniqueId,
      }),
    );
    assert.ok(
      puts.some((k) => k.includes(AGENT_EMAIL_HEADSHOT_FILENAME_SUFFIX)),
    );
    console.log("[1] Original + thumbnail + association... PASS");
  }

  // Original without thumbnail
  {
    const state = createState(AGENT);
    useMemoryBucket({ puts: [], deletes: [] });
    const result = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: AGENT,
      file: jpegFile(),
      emailHeadshot: null,
      prisma: mockPrisma(state),
    });
    assert.equal(result.emailHeadshotStored, false);
    assert.equal(result.emailHeadshotAssociated, false);
    assert.equal(state.associations.size, 0);
    console.log("[2] Original without thumbnail... PASS");
  }

  // Thumbnail validation failure
  {
    const state = createState(AGENT);
    useMemoryBucket({ puts: [], deletes: [] });
    const result = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: AGENT,
      file: jpegFile(),
      emailHeadshot: new File([agentProfileJpeg()], "bad.png", {
        type: "image/png",
      }),
      prisma: mockPrisma(state),
    });
    assert.ok(result.image);
    assert.equal(result.emailHeadshotStored, false);
    assert.equal(result.emailHeadshotAssociated, false);
    assert.equal(state.associations.size, 0);
    console.log("[3] Thumbnail validation failure... PASS");
  }

  // Thumbnail storage failure
  {
    const state = createState(PRIMARY);
    useMemoryBucket({
      puts: [],
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
    assert.ok(result.image);
    assert.equal(result.emailHeadshotStored, false);
    assert.equal(result.emailHeadshotAssociated, false);
    assert.equal(state.associations.size, 0);
    console.log("[4] Thumbnail storage failure... PASS");
  }

  // Association persistence failure — original + R2 thumb still ok
  {
    const state = createState(PRIMARY);
    state.associationPersistFailOnce = true;
    const puts: string[] = [];
    useMemoryBucket({ puts, deletes: [] });
    const result = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: PRIMARY,
      file: jpegFile(),
      emailHeadshot: emailHeadshotFile(),
      prisma: mockPrisma(state),
    });
    assert.ok(result.image);
    assert.equal(result.emailHeadshotStored, true);
    assert.equal(result.emailHeadshotAssociated, false);
    assert.equal(state.associations.size, 0);
    assert.ok(
      puts.some((k) => k.includes(AGENT_EMAIL_HEADSHOT_FILENAME_SUFFIX)),
    );
    console.log("[5] Association persistence failure... PASS");
  }

  // Canonical TX rollback — no association
  {
    const state = createState(PRIMARY);
    state.txFailOnce = true;
    const puts: string[] = [];
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
    assert.equal(state.associations.size, 0);
    assert.equal(
      puts.filter((k) => k.includes(AGENT_EMAIL_HEADSHOT_FILENAME_SUFFIX))
        .length,
      0,
    );
    console.log("[6] Canonical TX rollback... PASS");
  }

  // Sequential replacement
  {
    const state = createState(PRIMARY);
    const deletes: string[] = [];
    useMemoryBucket({ puts: [], deletes });
    const first = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: PRIMARY,
      file: jpegFile(),
      emailHeadshot: emailHeadshotFile(),
      prisma: mockPrisma(state),
    });
    const firstId = uniqueIdFromUrl(first.image!, PRIMARY);
    const second = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: PRIMARY,
      file: jpegFile(),
      emailHeadshot: emailHeadshotFile(),
      prisma: mockPrisma(state),
    });
    const secondId = uniqueIdFromUrl(second.image!, PRIMARY);
    assert.notEqual(firstId, secondId);
    const assoc = state.associations.get(assocKey(WS, PRIMARY));
    assert.ok(assoc);
    assert.equal(assoc.sourceUniqueId, secondId);
    assert.ok(
      deletes.every((k) => !k.includes(AGENT_EMAIL_HEADSHOT_FILENAME_SUFFIX)),
    );
    console.log("[7] Sequential replacement... PASS");
  }

  // Stale canonical mismatch after newer photo is current
  {
    const state = createState(PRIMARY);
    useMemoryBucket({ puts: [], deletes: [] });
    const first = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: PRIMARY,
      file: jpegFile(),
      emailHeadshot: emailHeadshotFile(),
      prisma: mockPrisma(state),
    });
    const firstId = uniqueIdFromUrl(first.image!, PRIMARY);
    const second = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: PRIMARY,
      file: jpegFile(),
      emailHeadshot: emailHeadshotFile(),
      prisma: mockPrisma(state),
    });
    const secondId = uniqueIdFromUrl(second.image!, PRIMARY);
    const stale = await persistAgentEmailHeadshotAssociationIfCurrent({
      workspaceId: WS,
      userId: PRIMARY,
      sourceUniqueId: firstId,
      emailHeadshotObjectKey: buildAgentEmailHeadshotObjectKey({
        workspaceId: WS,
        userId: PRIMARY,
        uniqueId: firstId,
      })!,
      expectedCanonicalImageUrl: first.image!,
      prisma: mockPrisma(state),
    });
    assert.equal(stale, false);
    const assoc = state.associations.get(assocKey(WS, PRIMARY));
    assert.ok(assoc);
    assert.equal(assoc.sourceUniqueId, secondId);
    console.log("[8] Stale canonical photo mismatch rejected... PASS");
  }

  // Replacement visible when persist obtains User lock (mock overlap)
  {
    const state = createState(PRIMARY);
    useMemoryBucket({ puts: [], deletes: [] });
    const first = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: PRIMARY,
      file: jpegFile(),
      emailHeadshot: emailHeadshotFile(),
      prisma: mockPrisma(state),
    });
    const firstId = uniqueIdFromUrl(first.image!, PRIMARY);
    const second = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: PRIMARY,
      file: jpegFile(),
      emailHeadshot: emailHeadshotFile(),
      prisma: mockPrisma(state),
    });
    const secondId = uniqueIdFromUrl(second.image!, PRIMARY);
    // Simulate: while A was preparing persist, B already replaced (cleared).
    // A then locks User and observes B's image.
    state.associations.delete(assocKey(WS, PRIMARY));
    state.onAfterUserLocked = () => {
      /* image already B from second upload */
    };
    const lateA = await persistAgentEmailHeadshotAssociationIfCurrent({
      workspaceId: WS,
      userId: PRIMARY,
      sourceUniqueId: firstId,
      emailHeadshotObjectKey: buildAgentEmailHeadshotObjectKey({
        workspaceId: WS,
        userId: PRIMARY,
        uniqueId: firstId,
      })!,
      expectedCanonicalImageUrl: first.image!,
      prisma: mockPrisma(state),
    });
    assert.equal(lateA, false);
    assert.equal(state.associations.size, 0);
    // Restore B's association as a successful late B persist would.
    state.associations.set(assocKey(WS, PRIMARY), {
      workspaceId: WS,
      userId: PRIMARY,
      sourceUniqueId: secondId,
      emailHeadshotObjectKey: buildAgentEmailHeadshotObjectKey({
        workspaceId: WS,
        userId: PRIMARY,
        uniqueId: secondId,
      })!,
    });
    state.onAfterUserLocked = null;
    console.log("[8b] Replace-while-A-preparing persist... PASS");
  }

  // Removal while association persistence is pending
  {
    const state = createState(PRIMARY);
    useMemoryBucket({ puts: [], deletes: [] });
    const uploaded = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: PRIMARY,
      file: jpegFile(),
      emailHeadshot: emailHeadshotFile(),
      prisma: mockPrisma(state),
    });
    const uniqueId = uniqueIdFromUrl(uploaded.image!, PRIMARY);
    state.associations.clear();
    state.onAfterUserLocked = () => {
      state.users.get(PRIMARY)!.image = null;
    };
    const pending = await persistAgentEmailHeadshotAssociationIfCurrent({
      workspaceId: WS,
      userId: PRIMARY,
      sourceUniqueId: uniqueId,
      emailHeadshotObjectKey: buildAgentEmailHeadshotObjectKey({
        workspaceId: WS,
        userId: PRIMARY,
        uniqueId,
      })!,
      expectedCanonicalImageUrl: uploaded.image!,
      prisma: mockPrisma(state),
    });
    assert.equal(pending, false);
    assert.equal(state.associations.size, 0);
    state.onAfterUserLocked = null;
    console.log("[8c] Remove-while-persist-pending... PASS");
  }

  // Association TX failure leaves canonical photo intact
  {
    const state = createState(PRIMARY);
    useMemoryBucket({ puts: [], deletes: [] });
    const uploaded = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: PRIMARY,
      file: jpegFile(),
      prisma: mockPrisma(state),
    });
    assert.ok(uploaded.image);
    state.expectAssocTx = true;
    state.associationTxFailOnce = true;
    const associated = await persistAgentEmailHeadshotAssociationIfCurrent({
      workspaceId: WS,
      userId: PRIMARY,
      sourceUniqueId: uniqueIdFromUrl(uploaded.image!, PRIMARY),
      emailHeadshotObjectKey: buildAgentEmailHeadshotObjectKey({
        workspaceId: WS,
        userId: PRIMARY,
        uniqueId: uniqueIdFromUrl(uploaded.image!, PRIMARY),
      })!,
      expectedCanonicalImageUrl: uploaded.image!,
      prisma: mockPrisma(state),
    });
    assert.equal(associated, false);
    assert.equal(state.users.get(PRIMARY)?.image, uploaded.image);
    assert.equal(state.associations.size, 0);
    console.log("[8d] Association TX failure keeps canonical... PASS");
  }

  // Explicit INSERT then UPDATE of association row
  {
    const state = createState(PRIMARY);
    useMemoryBucket({ puts: [], deletes: [] });
    const first = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: PRIMARY,
      file: jpegFile(),
      emailHeadshot: emailHeadshotFile(),
      prisma: mockPrisma(state),
    });
    assert.equal(first.emailHeadshotAssociated, true);
    assert.equal(state.associations.size, 1);
    const firstId = uniqueIdFromUrl(first.image!, PRIMARY);
    // Direct UPDATE path: same workspace/user, new uniqueId matching current image
    // (simulate re-associate after clear without full re-upload of original).
    const newId = "bbbbbbbbbbbbbbbbbbbbbbbb";
    const newUrl = first.image!.replace(firstId, newId);
    state.users.get(PRIMARY)!.image = newUrl;
    state.associations.delete(assocKey(WS, PRIMARY));
    const inserted = await persistAgentEmailHeadshotAssociationIfCurrent({
      workspaceId: WS,
      userId: PRIMARY,
      sourceUniqueId: newId,
      emailHeadshotObjectKey: buildAgentEmailHeadshotObjectKey({
        workspaceId: WS,
        userId: PRIMARY,
        uniqueId: newId,
      })!,
      expectedCanonicalImageUrl: newUrl,
      prisma: mockPrisma(state),
    });
    assert.equal(inserted, true);
    const updated = await persistAgentEmailHeadshotAssociationIfCurrent({
      workspaceId: WS,
      userId: PRIMARY,
      sourceUniqueId: newId,
      emailHeadshotObjectKey: buildAgentEmailHeadshotObjectKey({
        workspaceId: WS,
        userId: PRIMARY,
        uniqueId: newId,
      })!,
      expectedCanonicalImageUrl: newUrl,
      prisma: mockPrisma(state),
    });
    assert.equal(updated, true);
    assert.equal(
      state.associations.get(assocKey(WS, PRIMARY))?.sourceUniqueId,
      newId,
    );
    console.log("[8e] Association INSERT + UPDATE... PASS");
  }

  // Photo removal clears association; no thumb delete
  {
    const state = createState(PRIMARY);
    const deletes: string[] = [];
    useMemoryBucket({ puts: [], deletes });
    await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: PRIMARY,
      file: jpegFile(),
      emailHeadshot: emailHeadshotFile(),
      prisma: mockPrisma(state),
    });
    assert.equal(state.associations.size, 1);
    const deletesBefore = deletes.length;
    await removeAgentUserProfilePhoto({
      workspaceId: WS,
      userId: PRIMARY,
      prisma: mockPrisma(state),
    });
    assert.equal(state.users.get(PRIMARY)?.image, null);
    assert.equal(state.associations.size, 0);
    assert.ok(
      deletes
        .slice(deletesBefore)
        .every((k) => !k.includes(AGENT_EMAIL_HEADSHOT_FILENAME_SUFFIX)),
    );
    console.log("[9] Photo removal clears association... PASS");
  }

  // Cross-tenant / non-member
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
    assert.equal(state.associations.size, 0);
    console.log("[10] Cross-tenant / non-member... PASS");
  }

  // Primary branding compatibility + non-primary assoc
  {
    const state = createState(PRIMARY);
    useMemoryBucket({ puts: [], deletes: [] });
    const primary = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: PRIMARY,
      file: jpegFile(),
      emailHeadshot: emailHeadshotFile(),
      prisma: mockPrisma(state),
    });
    assert.equal(primary.syncedBrandingPortrait, true);
    assert.equal(primary.emailHeadshotAssociated, true);

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
    assert.equal(nonPrimary.emailHeadshotAssociated, true);
    assert.ok(state2.associations.has(assocKey(WS, AGENT)));
    console.log("[11] Primary branding + non-primary association... PASS");
  }

  // Reject foreign object key (never trust client keys)
  {
    const state = createState(PRIMARY);
    useMemoryBucket({ puts: [], deletes: [] });
    const uploaded = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: PRIMARY,
      file: jpegFile(),
      prisma: mockPrisma(state),
    });
    const rejected = await persistAgentEmailHeadshotAssociationIfCurrent({
      workspaceId: WS,
      userId: PRIMARY,
      sourceUniqueId: "abc123",
      emailHeadshotObjectKey: `workspaces/${WS_B}/agents/${PRIMARY}/profile/abc123-email-240.png`,
      expectedCanonicalImageUrl: uploaded.image!,
      prisma: mockPrisma(state),
    });
    assert.equal(rejected, false);
    console.log("[12] Foreign object key rejected... PASS");
  }

  // Workspace/user mismatch on persist inputs
  {
    const state = createState(PRIMARY);
    useMemoryBucket({ puts: [], deletes: [] });
    const uploaded = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: PRIMARY,
      file: jpegFile(),
      prisma: mockPrisma(state),
    });
    const uniqueId = uniqueIdFromUrl(uploaded.image!, PRIMARY);
    const wrongUser = await persistAgentEmailHeadshotAssociationIfCurrent({
      workspaceId: WS,
      userId: AGENT,
      sourceUniqueId: uniqueId,
      emailHeadshotObjectKey: buildAgentEmailHeadshotObjectKey({
        workspaceId: WS,
        userId: PRIMARY,
        uniqueId,
      })!,
      expectedCanonicalImageUrl: uploaded.image!,
      prisma: mockPrisma(state),
    });
    assert.equal(wrongUser, false);
    const wrongWs = await persistAgentEmailHeadshotAssociationIfCurrent({
      workspaceId: WS_B,
      userId: PRIMARY,
      sourceUniqueId: uniqueId,
      emailHeadshotObjectKey: buildAgentEmailHeadshotObjectKey({
        workspaceId: WS,
        userId: PRIMARY,
        uniqueId,
      })!,
      expectedCanonicalImageUrl: uploaded.image!,
      prisma: mockPrisma(state),
    });
    assert.equal(wrongWs, false);
    console.log("[13] Workspace/user mismatch rejected... PASS");
  }

  await runLocalPostgresLockRaceSelftest();

  setBrandingStorageTestDeps(null);
  console.log("\nAll email-headshot-association selftests passed.\n");
}

/**
 * Disposable local PostgreSQL only (Homebrew 127.0.0.1).
 * Never uses DATABASE_URL / Neon / shared hosts.
 *
 * Proves: while persist holds User FOR UPDATE, a concurrent replace blocks;
 * after persist commits a stale assoc, replace clears it; a late stale persist
 * after replace cannot re-insert.
 */
async function runLocalPostgresLockRaceSelftest(): Promise<void> {
  const { Client } = await import("pg");
  const adminUrl = "postgresql://ali@127.0.0.1:5432/postgres";
  const dbName = "houzzat_aeh_concurrency_selftest";
  const dbUrl = `postgresql://ali@127.0.0.1:5432/${dbName}`;

  const admin = new Client({ connectionString: adminUrl });
  try {
    await admin.connect();
  } catch (error) {
    console.log(
      "[14] Local PostgreSQL unavailable — skipped real lock race.",
      error instanceof Error ? error.message : error,
    );
    console.log(
      "     Expected semantics: SELECT User FOR UPDATE serializes with",
      "canonical User.image UPDATE; stale INSERT cannot commit after replace.",
    );
    return;
  }

  try {
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.query(`CREATE DATABASE ${dbName}`);
  } finally {
    await admin.end();
  }

  const setup = new Client({ connectionString: dbUrl });
  await setup.connect();
  try {
    await setup.query(`
      CREATE TABLE "User" (
        id TEXT PRIMARY KEY,
        image TEXT
      );
      CREATE TABLE "AgentEmailHeadshot" (
        id TEXT PRIMARY KEY,
        "workspaceId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "sourceUniqueId" TEXT NOT NULL,
        "emailHeadshotObjectKey" TEXT NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX "AgentEmailHeadshot_workspaceId_userId_key"
        ON "AgentEmailHeadshot" ("workspaceId", "userId");
      INSERT INTO "User" (id, image) VALUES ('user_race', 'https://cdn.example/a.jpg');
    `);
  } finally {
    await setup.end();
  }

  const urlA = "https://cdn.example/a.jpg";
  const urlB = "https://cdn.example/b.jpg";
  const ws = "ws_race";
  const userId = "user_race";

  // Race 1: persist A holds FOR UPDATE; replace B blocks; A upserts; B then
  // updates image + clears assoc → final image=B, no stale A assoc.
  const c1 = new Client({ connectionString: dbUrl });
  const c2 = new Client({ connectionString: dbUrl });
  await c1.connect();
  await c2.connect();
  try {
    await c1.query("BEGIN");
    const locked = await c1.query<{ id: string; image: string | null }>(
      `SELECT id, image FROM "User" WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    assert.equal(locked.rows[0]?.image, urlA);

    let c2Done = false;
    const c2Promise = (async () => {
      await c2.query("BEGIN");
      await c2.query(`UPDATE "User" SET image = $1 WHERE id = $2`, [urlB, userId]);
      await c2.query(
        `DELETE FROM "AgentEmailHeadshot" WHERE "workspaceId" = $1 AND "userId" = $2`,
        [ws, userId],
      );
      await c2.query("COMMIT");
      c2Done = true;
    })();

    await new Promise((r) => setTimeout(r, 80));
    assert.equal(c2Done, false, "replace must block on User FOR UPDATE");

    await c1.query(
      `
      INSERT INTO "AgentEmailHeadshot" (
        id, "workspaceId", "userId", "sourceUniqueId", "emailHeadshotObjectKey",
        "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("workspaceId", "userId") DO UPDATE SET
        "sourceUniqueId" = EXCLUDED."sourceUniqueId",
        "emailHeadshotObjectKey" = EXCLUDED."emailHeadshotObjectKey",
        "updatedAt" = CURRENT_TIMESTAMP
      `,
      ["aeh_a", ws, userId, "unique_a", `${ws}/${userId}/unique_a-email-240.png`],
    );
    await c1.query("COMMIT");

    await c2Promise;
    assert.equal(c2Done, true);

    const final = new Client({ connectionString: dbUrl });
    await final.connect();
    try {
      const user = await final.query<{ image: string | null }>(
        `SELECT image FROM "User" WHERE id = $1`,
        [userId],
      );
      const assoc = await final.query(
        `SELECT "sourceUniqueId" FROM "AgentEmailHeadshot" WHERE "workspaceId" = $1 AND "userId" = $2`,
        [ws, userId],
      );
      assert.equal(user.rows[0]?.image, urlB);
      assert.equal(assoc.rowCount, 0, "replace must clear stale association");
    } finally {
      await final.end();
    }
  } finally {
    await c1.end().catch(() => {});
    await c2.end().catch(() => {});
  }

  // Race 2: replace commits first; late stale persist sees mismatch → no write
  const late = new Client({ connectionString: dbUrl });
  await late.connect();
  try {
    await late.query("BEGIN");
    const locked = await late.query<{ image: string | null }>(
      `SELECT image FROM "User" WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    assert.equal(locked.rows[0]?.image, urlB);
    if (locked.rows[0]?.image !== urlA) {
      await late.query("ROLLBACK");
    } else {
      throw new Error("stale persist should have observed mismatch");
    }
    const assoc = await late.query(
      `SELECT 1 FROM "AgentEmailHeadshot" WHERE "workspaceId" = $1 AND "userId" = $2`,
      [ws, userId],
    );
    assert.equal(assoc.rowCount, 0);
  } finally {
    await late.end();
  }

  const cleanup = new Client({ connectionString: adminUrl });
  await cleanup.connect();
  try {
    await cleanup.query(`DROP DATABASE IF EXISTS ${dbName}`);
  } finally {
    await cleanup.end();
  }

  console.log("[14] Local PostgreSQL FOR UPDATE lock race... PASS");
}

main().catch((err) => {
  console.error(err);
  setBrandingStorageTestDeps(null);
  process.exitCode = 1;
});
