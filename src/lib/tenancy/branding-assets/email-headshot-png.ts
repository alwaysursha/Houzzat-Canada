/**
 * Phase 3D.4.0 — bounded structural PNG validation for email headshots.
 *
 * Pure Node (`node:zlib` inflate with maxOutputLength). No sharp / no native
 * image codecs. Suitable for the agent profile photo API (`runtime = "nodejs"`).
 *
 * Validates: full signature, chunk framing, CRCs, IHDR, consecutive IDAT,
 * IEND-last, no trailing bytes, inflate integrity, exact decoded size for
 * declared color type — with a hard cap against decompression bombs.
 */

import { inflateSync } from "node:zlib";

export const PNG_SIGNATURE = Uint8Array.of(
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
);

/** Expected RGBA8 non-interlaced decode budget for 240×240 (+ small slack). */
export const EMAIL_HEADSHOT_MAX_DECODED_BYTES =
  240 * (1 + 240 * 4) + 4096;

/**
 * PNG critical chunks we accept (ISO/IEC 15948).
 * Any other critical type (first letter A–Z) is rejected.
 * Ancillary types (first letter a–z) are allowed when CRC-valid.
 */
const KNOWN_CRITICAL_CHUNKS = new Set(["IHDR", "PLTE", "IDAT", "IEND"]);

/** PNG: critical iff bit 5 of the first type byte is clear (ASCII A–Z). */
function isCriticalChunkType(type: string): boolean {
  const first = type.charCodeAt(0);
  return first >= 0x41 && first <= 0x5a;
}

export type EmailHeadshotPngErrorCode =
  | "UNSUPPORTED_MIME"
  | "CORRUPT_IMAGE"
  | "DIMENSIONS_INVALID"
  | "FILE_TOO_LARGE";

export type EmailHeadshotPngOk = {
  ok: true;
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  decodedBytes: number;
};

export type EmailHeadshotPngErr = {
  ok: false;
  code: EmailHeadshotPngErrorCode;
  message: string;
};

export type EmailHeadshotPngResult = EmailHeadshotPngOk | EmailHeadshotPngErr;

type Chunk = {
  type: string;
  data: Uint8Array;
  /** Absolute offset of chunk length field in the source buffer. */
  offset: number;
};

function fail(
  code: EmailHeadshotPngErrorCode,
  message: string,
): EmailHeadshotPngErr {
  return { ok: false, code, message };
}

function readU32BE(buf: Uint8Array, offset: number): number {
  return (
    ((buf[offset]! << 24) |
      (buf[offset + 1]! << 16) |
      (buf[offset + 2]! << 8) |
      buf[offset + 3]!) >>>
    0
  );
}

/** PNG/ISO-3309 CRC-32 (poly 0xedb88320). */
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function pngCrc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function crc32TypeAndData(typeAscii: Uint8Array, data: Uint8Array): number {
  const joined = new Uint8Array(typeAscii.length + data.length);
  joined.set(typeAscii, 0);
  joined.set(data, typeAscii.length);
  return pngCrc32(joined);
}

function samplesPerPixel(colorType: number): number | null {
  switch (colorType) {
    case 0:
      return 1; // gray
    case 2:
      return 3; // rgb
    case 3:
      return 1; // palette index
    case 4:
      return 2; // gray+alpha
    case 6:
      return 4; // rgba
    default:
      return null;
  }
}

function bitsPerPixel(bitDepth: number, colorType: number): number | null {
  const spp = samplesPerPixel(colorType);
  if (spp === null) return null;
  if (colorType === 3) {
    // Palette: bit depth is index size (1/2/4/8).
    if (![1, 2, 4, 8].includes(bitDepth)) return null;
    return bitDepth;
  }
  // Canvas email thumbs are 8-bit; reject 16-bit to keep decode budget tight.
  if (bitDepth !== 8) return null;
  return spp * bitDepth;
}

function expectedDecodedBytes(
  width: number,
  height: number,
  bitDepth: number,
  colorType: number,
): number | null {
  const bpp = bitsPerPixel(bitDepth, colorType);
  if (bpp === null) return null;
  // Non-interlaced: each row = filter byte + ceil(width * bpp / 8)
  const rowBytes = 1 + Math.ceil((width * bpp) / 8);
  return height * rowBytes;
}

function hasFullPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

function parseChunks(bytes: Uint8Array): Chunk[] | EmailHeadshotPngErr {
  const chunks: Chunk[] = [];
  let offset = PNG_SIGNATURE.length;
  let sawIend = false;

  while (offset < bytes.length) {
    if (sawIend) {
      return fail(
        "CORRUPT_IMAGE",
        "Email headshot PNG has trailing bytes after IEND.",
      );
    }
    if (offset + 8 > bytes.length) {
      return fail(
        "CORRUPT_IMAGE",
        "Email headshot PNG chunk header is truncated.",
      );
    }

    const length = readU32BE(bytes, offset);
    // Reject absurd lengths even before bounds check (overflow / bomb).
    if (length > bytes.length) {
      return fail(
        "CORRUPT_IMAGE",
        "Email headshot PNG chunk length is invalid.",
      );
    }

    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    if (crcEnd > bytes.length) {
      return fail(
        "CORRUPT_IMAGE",
        "Email headshot PNG chunk is truncated.",
      );
    }

    const typeBytes = bytes.subarray(typeStart, typeStart + 4);
    const type = String.fromCharCode(
      typeBytes[0]!,
      typeBytes[1]!,
      typeBytes[2]!,
      typeBytes[3]!,
    );
    // Chunk type must be [A-Za-z]{4}
    if (!/^[A-Za-z]{4}$/.test(type)) {
      return fail("CORRUPT_IMAGE", "Email headshot PNG chunk type is invalid.");
    }

    const data = bytes.subarray(dataStart, dataEnd);
    const expectedCrc = readU32BE(bytes, dataEnd);
    const actualCrc = crc32TypeAndData(typeBytes, data);
    if (expectedCrc !== actualCrc) {
      return fail("CORRUPT_IMAGE", "Email headshot PNG chunk CRC mismatch.");
    }

    chunks.push({ type, data, offset });
    offset = crcEnd;

    if (type === "IEND") {
      sawIend = true;
    }
  }

  if (!sawIend) {
    return fail("CORRUPT_IMAGE", "Email headshot PNG is missing IEND.");
  }
  if (offset !== bytes.length) {
    return fail(
      "CORRUPT_IMAGE",
      "Email headshot PNG has trailing bytes after IEND.",
    );
  }
  return chunks;
}

function validateChunkSequence(chunks: Chunk[]): EmailHeadshotPngErr | null {
  if (chunks.length < 2) {
    return fail("CORRUPT_IMAGE", "Email headshot PNG is incomplete.");
  }
  if (chunks[0]!.type !== "IHDR") {
    return fail("CORRUPT_IMAGE", "Email headshot PNG must start with IHDR.");
  }
  if (chunks[chunks.length - 1]!.type !== "IEND") {
    return fail("CORRUPT_IMAGE", "Email headshot PNG must end with IEND.");
  }
  if (chunks[chunks.length - 1]!.data.length !== 0) {
    return fail("CORRUPT_IMAGE", "Email headshot PNG IEND must be empty.");
  }

  let ihdrCount = 0;
  let idatCount = 0;
  let idatEnded = false;
  let plteCount = 0;
  let plteAfterIdat = false;

  for (let i = 0; i < chunks.length; i++) {
    const type = chunks[i]!.type;

    // Reject unrecognized critical chunks (ancillary = lowercase first letter).
    if (isCriticalChunkType(type) && !KNOWN_CRITICAL_CHUNKS.has(type)) {
      return fail(
        "CORRUPT_IMAGE",
        `Email headshot PNG has unknown critical chunk (${type}).`,
      );
    }

    if (type === "IHDR") {
      ihdrCount++;
      if (ihdrCount > 1 || i !== 0) {
        return fail("CORRUPT_IMAGE", "Email headshot PNG has invalid IHDR.");
      }
      continue;
    }
    if (type === "IEND") {
      if (i !== chunks.length - 1) {
        return fail("CORRUPT_IMAGE", "Email headshot PNG IEND must be last.");
      }
      continue;
    }
    if (type === "IDAT") {
      if (idatEnded) {
        return fail(
          "CORRUPT_IMAGE",
          "Email headshot PNG IDAT chunks must be consecutive.",
        );
      }
      idatCount++;
      continue;
    }
    // Non-IDAT after IDAT started → IDAT run has ended (must not resume).
    if (idatCount > 0) {
      idatEnded = true;
    }
    if (type === "PLTE") {
      plteCount++;
      if (plteCount > 1) {
        return fail("CORRUPT_IMAGE", "Email headshot PNG has duplicate PLTE.");
      }
      if (idatCount > 0) {
        plteAfterIdat = true;
      }
    }
  }

  if (idatCount < 1) {
    return fail("CORRUPT_IMAGE", "Email headshot PNG is missing IDAT.");
  }
  if (plteAfterIdat) {
    return fail(
      "CORRUPT_IMAGE",
      "Email headshot PNG PLTE must appear before IDAT.",
    );
  }
  return null;
}

/**
 * PLTE rules per color type (ISO/IEC 15948):
 * - type 3: required, before IDAT (ordering enforced above)
 * - type 2/6: optional, before IDAT
 * - type 0/4: forbidden
 */
function validatePlteForColorType(
  chunks: Chunk[],
  colorType: number,
): EmailHeadshotPngErr | null {
  const hasPlte = chunks.some((c) => c.type === "PLTE");
  if (colorType === 3) {
    if (!hasPlte) {
      return fail(
        "CORRUPT_IMAGE",
        "Email headshot PNG palette image is missing PLTE.",
      );
    }
    return null;
  }
  if (colorType === 0 || colorType === 4) {
    if (hasPlte) {
      return fail(
        "CORRUPT_IMAGE",
        "Email headshot PNG grayscale image must not include PLTE.",
      );
    }
    return null;
  }
  // RGB / RGBA: optional PLTE already constrained to before IDAT.
  return null;
}

function inflateIdatFully(
  compressed: Uint8Array,
  maxDecodedBytes: number,
): { ok: true; buffer: Buffer } | EmailHeadshotPngErr {
  let result: unknown;
  try {
    // info:true exposes engine.bytesWritten = input bytes consumed by zlib.
    // Require full consumption so valid-zlib + trailing junk is rejected.
    result = inflateSync(Buffer.from(compressed), {
      maxOutputLength: maxDecodedBytes,
      info: true,
    });
  } catch {
    return fail(
      "CORRUPT_IMAGE",
      "Email headshot PNG image data could not be decompressed.",
    );
  }

  if (
    !result ||
    typeof result !== "object" ||
    !("buffer" in result) ||
    !("engine" in result)
  ) {
    return fail(
      "CORRUPT_IMAGE",
      "Email headshot PNG decompressor did not report input consumption.",
    );
  }

  const info = result as {
    buffer: Buffer;
    engine: { bytesWritten?: unknown };
  };
  if (!(info.buffer instanceof Buffer)) {
    return fail(
      "CORRUPT_IMAGE",
      "Email headshot PNG decompressor did not report input consumption.",
    );
  }
  if (typeof info.engine?.bytesWritten !== "number") {
    return fail(
      "CORRUPT_IMAGE",
      "Email headshot PNG decompressor did not report input consumption.",
    );
  }

  if (info.engine.bytesWritten !== compressed.length) {
    return fail(
      "CORRUPT_IMAGE",
      "Email headshot PNG IDAT has trailing compressed junk.",
    );
  }

  return { ok: true, buffer: info.buffer };
}

/**
 * Structurally validate a PNG and inflate IDAT under a hard decoded-size cap.
 * `expectedWidth` / `expectedHeight` enforce exact pixel dimensions.
 */
export function validateEmailHeadshotPngStructure(
  bytes: Uint8Array,
  expectedWidth: number,
  expectedHeight: number,
  maxDecodedBytes: number = EMAIL_HEADSHOT_MAX_DECODED_BYTES,
): EmailHeadshotPngResult {
  if (!hasFullPngSignature(bytes)) {
    return fail("UNSUPPORTED_MIME", "Email headshot must be a PNG.");
  }

  const parsed = parseChunks(bytes);
  if (!Array.isArray(parsed)) return parsed;

  const seqErr = validateChunkSequence(parsed);
  if (seqErr) return seqErr;

  const ihdr = parsed[0]!.data;
  if (ihdr.length !== 13) {
    return fail("CORRUPT_IMAGE", "Email headshot PNG IHDR is invalid.");
  }

  const width = readU32BE(ihdr, 0);
  const height = readU32BE(ihdr, 4);
  const bitDepth = ihdr[8]!;
  const colorType = ihdr[9]!;
  const compression = ihdr[10]!;
  const filter = ihdr[11]!;
  const interlace = ihdr[12]!;

  if (compression !== 0 || filter !== 0) {
    return fail(
      "CORRUPT_IMAGE",
      "Email headshot PNG compression/filter method is unsupported.",
    );
  }
  if (interlace !== 0) {
    // Reject Adam7 — simplifies decode budget and matches Canvas exports.
    return fail(
      "CORRUPT_IMAGE",
      "Email headshot PNG interlacing is not allowed.",
    );
  }

  if (width !== expectedWidth || height !== expectedHeight) {
    return fail(
      "DIMENSIONS_INVALID",
      `Email headshot must be exactly ${expectedWidth}×${expectedHeight}px.`,
    );
  }

  if (samplesPerPixel(colorType) === null) {
    return fail("CORRUPT_IMAGE", "Email headshot PNG color type is invalid.");
  }

  const plteErr = validatePlteForColorType(parsed, colorType);
  if (plteErr) return plteErr;

  const expected = expectedDecodedBytes(width, height, bitDepth, colorType);
  if (expected === null) {
    return fail(
      "CORRUPT_IMAGE",
      "Email headshot PNG bit depth / color type is unsupported.",
    );
  }
  if (expected > maxDecodedBytes) {
    return fail(
      "FILE_TOO_LARGE",
      "Email headshot decoded size exceeds safety limit.",
    );
  }

  // Concatenate consecutive IDAT payloads.
  const idatParts: Uint8Array[] = [];
  let idatTotal = 0;
  for (const chunk of parsed) {
    if (chunk.type !== "IDAT") continue;
    idatParts.push(chunk.data);
    idatTotal += chunk.data.length;
  }
  if (idatTotal < 1) {
    return fail("CORRUPT_IMAGE", "Email headshot PNG is missing IDAT.");
  }

  const compressed = new Uint8Array(idatTotal);
  let w = 0;
  for (const part of idatParts) {
    compressed.set(part, w);
    w += part.length;
  }

  const inflated = inflateIdatFully(compressed, maxDecodedBytes);
  if (!inflated.ok) return inflated;
  const decoded = inflated.buffer;

  if (decoded.length !== expected) {
    return fail(
      "CORRUPT_IMAGE",
      "Email headshot PNG decoded size does not match IHDR.",
    );
  }

  // Filter byte per scanline must be 0–4.
  const rowBytes = expected / height;
  for (let y = 0; y < height; y++) {
    const filterByte = decoded[y * rowBytes]!;
    if (filterByte > 4) {
      return fail(
        "CORRUPT_IMAGE",
        "Email headshot PNG has an invalid scanline filter.",
      );
    }
  }

  return {
    ok: true,
    width,
    height,
    bitDepth,
    colorType,
    decodedBytes: decoded.length,
  };
}
