/**
 * Phase 3D.4.0 — complete email-headshot PNG validation.
 * Run: pnpm email-headshot-png-validate:selftest
 *
 * Hermetic. No R2. No DB. No emails.
 */
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import {
  EMAIL_HEADSHOT_MAX_BYTES,
  EMAIL_HEADSHOT_MAX_DECODED_BYTES,
  EMAIL_HEADSHOT_REQUIRED_SIZE,
  PNG_SIGNATURE,
  pngCrc32,
  uploadAgentUserProfilePhoto,
  validateEmailHeadshotBytes,
  setBrandingStorageTestDeps,
} from "@/lib/tenancy/branding-assets";
import type { PrismaClient } from "@prisma/client";

const SIZE = EMAIL_HEADSHOT_REQUIRED_SIZE;

function u32be(n: number): Uint8Array {
  return Uint8Array.of(
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  );
}

function chunk(type: string, data: Uint8Array): Uint8Array {
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

function concatParts(parts: Uint8Array[]): Uint8Array {
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

function rgbaRaw(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): Uint8Array {
  const row = 1 + width * 4;
  const raw = new Uint8Array(height * row);
  for (let y = 0; y < height; y++) {
    const base = y * row;
    raw[base] = 0; // filter None
    for (let x = 0; x < width; x++) {
      const p = base + 1 + x * 4;
      raw[p] = rgba[0];
      raw[p + 1] = rgba[1];
      raw[p + 2] = rgba[2];
      raw[p + 3] = rgba[3];
    }
  }
  return raw;
}

function rgbaIhdr(width: number, height: number): Uint8Array {
  const ihdr = new Uint8Array(13);
  ihdr.set(u32be(width), 0);
  ihdr.set(u32be(height), 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return ihdr;
}

/** Valid non-interlaced 8-bit RGBA PNG (filter-None scanlines). */
function solidRgbaPng(
  width: number,
  height: number,
  rgba: [number, number, number, number] = [30, 80, 120, 255],
): Uint8Array {
  const idat = deflateSync(Buffer.from(rgbaRaw(width, height, rgba)), {
    level: 9,
  });
  return concatParts([
    PNG_SIGNATURE,
    chunk("IHDR", rgbaIhdr(width, height)),
    chunk("IDAT", new Uint8Array(idat)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/** Valid RGBA PNG with a legitimate ancillary chunk before IDAT. */
function rgbaWithAncillary(width: number, height: number): Uint8Array {
  const idat = deflateSync(
    Buffer.from(rgbaRaw(width, height, [10, 20, 30, 255])),
    { level: 9 },
  );
  // tEXt: keyword "Title" + NUL + text (ancillary: lowercase 't')
  const text = Uint8Array.from(
    Buffer.from("Title\0Agent email headshot"),
  );
  return concatParts([
    PNG_SIGNATURE,
    chunk("IHDR", rgbaIhdr(width, height)),
    chunk("tEXt", text),
    chunk("IDAT", new Uint8Array(idat)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/** Unknown critical chunk FOOO (uppercase F) with valid CRC. */
function rgbaWithUnknownCritical(width: number, height: number): Uint8Array {
  const idat = deflateSync(
    Buffer.from(rgbaRaw(width, height, [10, 20, 30, 255])),
    { level: 9 },
  );
  return concatParts([
    PNG_SIGNATURE,
    chunk("IHDR", rgbaIhdr(width, height)),
    chunk("FOOO", Uint8Array.from([0x01, 0x02])),
    chunk("IDAT", new Uint8Array(idat)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/** PLTE after IDAT — invalid for all color types. */
function rgbaWithPlteAfterIdat(width: number, height: number): Uint8Array {
  const idat = deflateSync(
    Buffer.from(rgbaRaw(width, height, [10, 20, 30, 255])),
    { level: 9 },
  );
  const plte = Uint8Array.from([0, 0, 0, 255, 0, 0]); // 2 RGB entries
  return concatParts([
    PNG_SIGNATURE,
    chunk("IHDR", rgbaIhdr(width, height)),
    chunk("IDAT", new Uint8Array(idat)),
    chunk("PLTE", plte),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/** Valid zlib stream in IDAT followed by unused compressed junk. */
function rgbaWithIdatTrailingJunk(width: number, height: number): Uint8Array {
  const idat = deflateSync(
    Buffer.from(rgbaRaw(width, height, [10, 20, 30, 255])),
    { level: 9 },
  );
  const junked = new Uint8Array(idat.length + 8);
  junked.set(idat, 0);
  junked.set([0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe, 0xba, 0xbe], idat.length);
  return concatParts([
    PNG_SIGNATURE,
    chunk("IHDR", rgbaIhdr(width, height)),
    chunk("IDAT", junked),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

function agentProfileJpeg(): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
    0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x01,
    0xf4, 0x01, 0x90, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9,
  ]);
}

/** IHDR-only forgery (legacy 3D.3 helper shape). */
function forgedIhdrOnly(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(33);
  buf.set(PNG_SIGNATURE, 0);
  buf[11] = 13;
  buf.set([0x49, 0x48, 0x44, 0x52], 12);
  buf.set(u32be(width), 16);
  buf.set(u32be(height), 20);
  buf[24] = 8;
  buf[25] = 6;
  return buf;
}

function mutateCrc(png: Uint8Array): Uint8Array {
  const out = new Uint8Array(png);
  // Flip a byte inside the IHDR CRC field (bytes 29–32 after sig+len+type+data).
  // Signature(8) + len(4) + type(4) + data(13) = 29 → CRC at 29.
  out[29] = (out[29]! ^ 0xff) & 0xff;
  return out;
}

function stripIdat(png: Uint8Array): Uint8Array {
  // Rebuild: signature + IHDR + IEND only from a valid PNG.
  const width = SIZE;
  const height = SIZE;
  const ihdr = new Uint8Array(13);
  ihdr.set(u32be(width), 0);
  ihdr.set(u32be(height), 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const parts = [PNG_SIGNATURE, chunk("IHDR", ihdr), chunk("IEND", new Uint8Array(0))];
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

function stripIend(png: Uint8Array): Uint8Array {
  // Drop last 12 bytes (empty IEND chunk).
  return png.subarray(0, png.length - 12);
}

function appendTrailing(png: Uint8Array): Uint8Array {
  const out = new Uint8Array(png.length + 4);
  out.set(png, 0);
  out.set([0xde, 0xad, 0xbe, 0xef], png.length);
  return out;
}

function badChunkLength(png: Uint8Array): Uint8Array {
  const out = new Uint8Array(png);
  // Set IHDR declared length to 0xfffffffe (overflow-ish / past EOF).
  out[8] = 0xff;
  out[9] = 0xff;
  out[10] = 0xff;
  out[11] = 0xfe;
  return out;
}

function corruptIdatPayload(): Uint8Array {
  const width = SIZE;
  const height = SIZE;
  const ihdr = new Uint8Array(13);
  ihdr.set(u32be(width), 0);
  ihdr.set(u32be(height), 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  // Not valid zlib.
  const junk = Uint8Array.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
  const parts = [
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", junk),
    chunk("IEND", new Uint8Array(0)),
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

/** IHDR claims 240×240 gray; IDAT inflates far beyond safety cap. */
function decompressionBomb(): Uint8Array {
  const width = SIZE;
  const height = SIZE;
  const ihdr = new Uint8Array(13);
  ihdr.set(u32be(width), 0);
  ihdr.set(u32be(height), 4);
  ihdr[8] = 8;
  ihdr[9] = 0; // gray — expected decode is small, but we still cap inflate
  const huge = Buffer.alloc(EMAIL_HEADSHOT_MAX_DECODED_BYTES + 64 * 1024, 0);
  const idat = deflateSync(huge, { level: 9 });
  const parts = [
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", new Uint8Array(idat)),
    chunk("IEND", new Uint8Array(0)),
  ];
  let total = 0;
  for (const p of parts) total += p.length;
  assert.ok(total <= EMAIL_HEADSHOT_MAX_BYTES, "bomb fixture must fit input cap");
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function expectCode(
  bytes: Uint8Array,
  code: string,
  label: string,
): void {
  const result = validateEmailHeadshotBytes(bytes);
  assert.ok("code" in result, `${label}: expected error`);
  assert.equal(result.code, code, `${label}: code`);
  console.log(`  ✓ ${label}`);
}

// Minimal prisma/storage mock for "original unaffected" check
const WS = "ws_png_a";
const USER = "user_png";

function mockPrisma(): PrismaClient {
  const branding = {
    agentProfilePhotoUrl: null as string | null,
    logoUrl: null,
    brokerageLogoUrl: null,
    faviconUrl: null,
    themeId: "agent-signature",
    version: 1,
  };
  const user = { id: USER, image: null as string | null };
  const db = {
    workspace: {
      findUnique: async () => ({ primaryAgentId: USER }),
    },
    workspaceMember: {
      findFirst: async () => ({ userId: USER }),
    },
    workspaceBranding: {
      findUnique: async () => ({ ...branding }),
      findFirst: async () => null,
    },
    workspaceOnboardingState: {
      findUnique: async () => ({ workspaceId: WS, brandingStatus: "COMPLETE" }),
      create: async () => ({}),
      update: async () => ({}),
    },
    user: {
      findUnique: async () => ({ id: user.id, image: user.image }),
      findFirst: async () => null,
      update: async ({ data }: { data: { image: string | null } }) => {
        user.image = data.image;
        return user;
      },
    },
    agentEmailHeadshot: {
      deleteMany: async () => ({ count: 0 }),
    },
    $executeRaw: async () => {
      branding.agentProfilePhotoUrl = user.image;
      branding.version += 1;
      return 1;
    },
    $transaction: async (fn: (tx: typeof db) => Promise<unknown>) => fn(db),
  };
  return db as unknown as PrismaClient;
}

async function main() {
  console.log("\n=== PHASE 3D.4.0 — EMAIL HEADSHOT PNG VALIDATION ===\n");

  {
    const ok = validateEmailHeadshotBytes(solidRgbaPng(SIZE, SIZE));
    assert.ok(!("code" in ok), "valid PNG should pass");
    assert.equal(ok.width, SIZE);
    assert.equal(ok.height, SIZE);
    assert.equal(ok.mime, "image/png");
    console.log("  ✓ Valid 240×240 RGBA PNG");
  }

  {
    const ok = validateEmailHeadshotBytes(rgbaWithAncillary(SIZE, SIZE));
    assert.ok(!("code" in ok), "ancillary tEXt should pass");
    console.log("  ✓ Valid ancillary chunk (tEXt) accepted");
  }

  expectCode(
    rgbaWithUnknownCritical(SIZE, SIZE),
    "CORRUPT_IMAGE",
    "Unknown critical chunk with valid CRC",
  );
  expectCode(
    rgbaWithPlteAfterIdat(SIZE, SIZE),
    "CORRUPT_IMAGE",
    "PLTE after IDAT",
  );
  expectCode(
    rgbaWithIdatTrailingJunk(SIZE, SIZE),
    "CORRUPT_IMAGE",
    "Valid zlib stream followed by IDAT junk",
  );

  expectCode(solidRgbaPng(SIZE, SIZE).subarray(0, 40), "CORRUPT_IMAGE", "Truncated PNG");
  expectCode(forgedIhdrOnly(SIZE, SIZE), "CORRUPT_IMAGE", "Forged IHDR-only");
  expectCode(stripIdat(solidRgbaPng(SIZE, SIZE)), "CORRUPT_IMAGE", "Missing IDAT");
  expectCode(stripIend(solidRgbaPng(SIZE, SIZE)), "CORRUPT_IMAGE", "Missing IEND");
  expectCode(mutateCrc(solidRgbaPng(SIZE, SIZE)), "CORRUPT_IMAGE", "Corrupt CRC");
  expectCode(corruptIdatPayload(), "CORRUPT_IMAGE", "Corrupt compressed IDAT");
  expectCode(solidRgbaPng(100, 100), "DIMENSIONS_INVALID", "Wrong dimensions");
  expectCode(
    new Uint8Array(EMAIL_HEADSHOT_MAX_BYTES + 1).fill(0x89),
    "FILE_TOO_LARGE",
    "Oversized input",
  );
  expectCode(agentProfileJpeg(), "UNSUPPORTED_MIME", "JPEG disguised / non-PNG");
  expectCode(
    Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]),
    "UNSUPPORTED_MIME",
    "WebP disguised as image",
  );
  expectCode(
    Uint8Array.from(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>")),
    "UNSUPPORTED_MIME",
    "SVG rejected",
  );
  expectCode(badChunkLength(solidRgbaPng(SIZE, SIZE)), "CORRUPT_IMAGE", "Malformed chunk length");
  expectCode(appendTrailing(solidRgbaPng(SIZE, SIZE)), "CORRUPT_IMAGE", "Trailing invalid bytes");
  expectCode(decompressionBomb(), "CORRUPT_IMAGE", "Excessive decompressed output");

  // Original upload unaffected by bad thumbnail
  {
    const puts: string[] = [];
    setBrandingStorageTestDeps({
      isProduction: () => true,
      getPublicBase: () => "https://cdn.example",
      getBucket: async () => ({
        put: async (key) => {
          puts.push(String(key));
        },
        delete: async () => {},
      }),
    });
    const result = await uploadAgentUserProfilePhoto({
      workspaceId: WS,
      userId: USER,
      file: new File([agentProfileJpeg()], "a.jpg", { type: "image/jpeg" }),
      emailHeadshot: new File([forgedIhdrOnly(SIZE, SIZE)], "bad.png", {
        type: "image/png",
      }),
      prisma: mockPrisma(),
    });
    assert.ok(result.image);
    assert.equal(result.emailHeadshotStored, false);
    assert.equal(
      puts.filter((k) => k.includes("-email-240.png")).length,
      0,
    );
    assert.equal(puts.filter((k) => !k.includes("-email-240.png")).length, 1);
    setBrandingStorageTestDeps(null);
    console.log("  ✓ Original upload unaffected by thumbnail validation failure");
  }

  console.log(
    `\nDecode cap: ${EMAIL_HEADSHOT_MAX_DECODED_BYTES} bytes; input cap: ${EMAIL_HEADSHOT_MAX_BYTES} bytes`,
  );
  console.log("\nemail-headshot-png-validate selftest: OK\n");
}

main().catch((err) => {
  console.error(err);
  setBrandingStorageTestDeps(null);
  process.exitCode = 1;
});
